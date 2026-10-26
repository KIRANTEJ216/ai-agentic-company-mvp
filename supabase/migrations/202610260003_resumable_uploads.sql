create table social_uploads(id uuid primary key,workspace_id uuid not null references social_workspaces,product_id uuid not null references social_products,creator uuid not null references auth.users,checksum text not null,bytes integer not null check(bytes between 1 and 8388608),state text not null default 'open' check(state in ('open','complete','expired')),created_at timestamptz not null default now());
create table social_upload_parts(upload_id uuid not null references social_uploads on delete cascade,part integer not null check(part>=0 and part<8),checksum text not null,bytes integer not null,uploaded boolean not null default false,primary key(upload_id,part));
alter table social_uploads enable row level security;
alter table social_upload_parts enable row level security;
create policy upload_read on social_uploads for select using(creator=auth.uid() and social_role(workspace_id) is not null);
create policy parts_read on social_upload_parts for select using(exists(select 1 from social_uploads where id=upload_id and creator=auth.uid()));
grant select on social_uploads,social_upload_parts to authenticated;
revoke insert,update,delete on social_uploads,social_upload_parts from anon,authenticated;
grant all on social_uploads,social_upload_parts to service_role;
create function social_upload_begin(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p social_products; u social_uploads; ident uuid;begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into p from social_products where id=(payload->>'product_id')::uuid;
 if p.id is null or coalesce(social_role(p.workspace_id),'') not in ('owner','editor') then raise exception 'Product access denied';end if;
 perform 1 from social_workspaces where id=p.workspace_id for update;
 if payload->>'checksum' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid checksum';end if;
 ident=(payload->>'id')::uuid;
 select * into u from social_uploads where id=ident;
 if u.id is not null then
  if u.creator<>auth.uid() or u.product_id<>p.id or u.checksum<>payload->>'checksum' or u.bytes<>(payload->>'bytes')::int then raise exception 'Upload ID conflict';end if;
  return to_jsonb(u);
 end if;
 if exists(select 1 from social_variants where product_id=p.id) then raise exception 'Image locked after drafting';end if;
 if (select count(*) from social_uploads where workspace_id=p.workspace_id and state='open')>=10 then raise exception 'Too many pending uploads; wait for expiration';end if;
 insert into social_uploads(id,workspace_id,product_id,creator,checksum,bytes) values(ident,p.workspace_id,p.id,auth.uid(),payload->>'checksum',(payload->>'bytes')::int) returning * into u;
 return to_jsonb(u);
end$$;
create function social_upload_part(session_id uuid,actor uuid,part_index integer,part_hash text,part_bytes integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u social_uploads; old_hash text; expected integer;begin
 select * into u from social_uploads where id=session_id for update;
 if u.id is null or u.creator<>actor or u.state<>'open' or u.created_at<now()-interval '24 hours' then raise exception 'Upload unavailable or expired';end if;
 if not exists(select 1 from social_members m join social_workspaces w on w.id=m.workspace_id where m.workspace_id=u.workspace_id and m.user_id=actor and m.role in ('owner','editor') and w.deletion_requested_at is null) then raise exception 'Editor required';end if;
 expected=least(1048576,u.bytes-part_index*1048576);
 if part_index<0 or part_index>=ceil(u.bytes/1048576.0) or part_bytes<>expected or part_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid part';end if;
 select checksum into old_hash from social_upload_parts where upload_id=session_id and part=part_index;
 if old_hash is not null and old_hash<>part_hash then raise exception 'Part content conflict';end if;
 insert into social_upload_parts values(session_id,part_index,part_hash,part_bytes,false) on conflict do nothing;
end$$;
create function social_upload_complete(session_id uuid,actor uuid,object_path text,mime_type text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u social_uploads; p social_products;begin
 select * into u from social_uploads where id=session_id;
 if u.id is null or u.creator<>actor then raise exception 'Upload access denied';end if;
 perform 1 from social_workspaces where id=u.workspace_id for update;
 select * into u from social_uploads where id=session_id for update;
 if u.state='complete' then return;end if;
 if u.state<>'open' or u.created_at<now()-interval '24 hours' then raise exception 'Upload expired';end if;
 if not exists(select 1 from social_members m join social_workspaces w on w.id=m.workspace_id where m.workspace_id=u.workspace_id and m.user_id=actor and m.role in ('owner','editor') and w.deletion_requested_at is null) then raise exception 'Editor required';end if;
 select * into p from social_products where id=u.product_id for update;
 if exists(select 1 from social_variants where product_id=p.id) then raise exception 'Image locked after drafting';end if;
 if (select coalesce(sum(bytes),0) from social_upload_parts where upload_id=u.id and uploaded)<>u.bytes then raise exception 'Parts incomplete';end if;
 if object_path<>u.workspace_id::text||'/'||p.id::text||'/'||u.id::text||'.original' or mime_type not in ('image/png','image/jpeg') then raise exception 'Invalid original path or MIME';end if;
 if p.object_key is not null and p.object_key<>object_path then insert into social_storage_cleanup(object_key) values(p.object_key) on conflict do nothing;end if;
 update social_products set object_key=object_path,checksum=u.checksum,mime=mime_type where id=p.id;
 update social_uploads set state='complete' where id=u.id;
 insert into social_storage_cleanup(object_key) select u.workspace_id::text||'/'||u.product_id::text||'/parts/'||u.id::text||'/'||part from social_upload_parts where upload_id=u.id on conflict do nothing;
 insert into social_audit(workspace_id,actor,action,reference) values(u.workspace_id,actor,'resumable_upload_completed',p.id::text);
end$$;
revoke all on function social_upload_begin(jsonb) from public,anon;
grant execute on function social_upload_begin(jsonb) to authenticated;
revoke all on function social_upload_part(uuid,uuid,integer,text,integer),social_upload_complete(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function social_upload_part(uuid,uuid,integer,text,integer),social_upload_complete(uuid,uuid,text,text) to service_role;
-- Extend maintenance without resetting configured retention.
alter function social_maintenance() rename to social_maintenance_v1;
revoke all on function social_maintenance_v1() from public,anon,authenticated,service_role;
create function social_maintenance() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare count_removed integer;begin
 count_removed=social_maintenance_v1();
 -- Locks prevent racing final attachment. Temp uploads expire after 24 hours.
 perform 1 from social_uploads where state='open' and created_at<now()-interval '24 hours' for update;
 insert into social_storage_cleanup(object_key) select u.workspace_id::text||'/'||u.product_id::text||'/parts/'||u.id::text||'/'||p.part from social_uploads u join social_upload_parts p on p.upload_id=u.id where u.state='open' and u.created_at<now()-interval '24 hours' on conflict do nothing;
 insert into social_storage_cleanup(object_key) select workspace_id::text||'/'||product_id::text||'/'||id::text||'.original' from social_uploads where state='open' and created_at<now()-interval '24 hours' on conflict do nothing;
 update social_uploads set state='expired' where state='open' and created_at<now()-interval '24 hours';
 return count_removed;
end$$;
revoke all on function social_maintenance() from public,anon,authenticated;
grant execute on function social_maintenance() to service_role;
-- Extend command deletion cleanup before invoking its transaction.
alter function social_command(text,jsonb) rename to social_command_v2;
revoke all on function social_command_v2(text,jsonb) from public,anon,authenticated;
create function social_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;old_key text; result jsonb;begin
 if action in ('delete_workspace','asset') then
  if auth.uid() is null then raise exception 'Sign in required';end if;
  w=(payload->>'workspace_id')::uuid;
  if social_role(w) is null then raise exception 'Workspace access denied';end if;
  perform 1 from social_workspaces where id=w for update;
  if action='delete_workspace' then
   if social_role(w)<>'owner' then raise exception 'Owner required';end if;
   insert into social_storage_cleanup(object_key) select u.workspace_id::text||'/'||u.product_id::text||'/parts/'||u.id::text||'/'||p.part from social_uploads u join social_upload_parts p on p.upload_id=u.id where u.workspace_id=w on conflict do nothing;
   delete from social_uploads where workspace_id=w;
  else
   select object_key into old_key from social_products where id=(payload->>'product_id')::uuid and workspace_id=w;
  end if;
 end if;
 result=social_command_v2(action,payload);
 if action='asset' and old_key is not null and old_key is distinct from payload->>'object_key' then insert into social_storage_cleanup(object_key) values(old_key) on conflict do nothing;end if;
 return result;
end$$;
revoke all on function social_command(text,jsonb) from public,anon;
grant execute on function social_command(text,jsonb) to authenticated;
