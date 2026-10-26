-- Fact changes invalidate future approvals; published evidence remains historical.
alter table social_brands add column version integer not null default 1;
alter table social_products add column version integer not null default 1;
alter table social_notifications add column read_by uuid[] not null default '{}';
alter table social_notifications add column dismissed_by uuid[] not null default '{}';
alter function social_command(text,jsonb) rename to social_command_v4;
revoke all on function social_command_v4(text,jsonb) from public,anon,authenticated;
create function social_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;r text;ident uuid;targets uuid[];current_version integer;begin
 if action not in ('brand_edit','product_edit','notice_read','notice_dismiss') then return social_command_v4(action,payload);end if;
 if auth.uid() is null then raise exception 'Sign in required';end if;
 w=(payload->>'workspace_id')::uuid;
 perform 1 from social_workspaces where id=w for update;
 r=social_role(w);if r is null then raise exception 'Workspace access denied';end if;
 ident=(payload->>'id')::uuid;
 if action in ('notice_read','notice_dismiss') then
  update social_notifications set read_by=array(select distinct unnest(read_by||array[auth.uid()])),dismissed_by=case when action='notice_dismiss' then array(select distinct unnest(dismissed_by||array[auth.uid()])) else dismissed_by end where id=ident and workspace_id=w;
  return '{}'::jsonb;
 end if;
 if r='reviewer' then raise exception 'Editor required';end if;
 if length(trim(coalesce(payload->>'name',''))) not between 1 and 120 or length(trim(coalesce(payload->>'facts',''))) not between 1 and 6000 then raise exception 'Name and confirmed facts required';end if;
 if action='brand_edit' then
  select version into current_version from social_brands where id=ident and workspace_id=w for update;
  select array_agg(id) into targets from social_products where brand_id=ident and workspace_id=w;
 else
  select version into current_version from social_products where id=ident and workspace_id=w for update;
  targets=array[ident];
 end if;
 if current_version is null then raise exception 'Record not found';end if;
 if current_version is distinct from (payload->>'version')::integer then raise exception 'Facts changed; reload before editing';end if;
 if exists(select 1 from social_jobs j join social_variants v on v.id=j.variant_id where v.product_id=any(targets) and j.state in ('publishing','confirming')) then raise exception 'Resolve in-flight publication before changing facts';end if;
 if exists(select 1 from social_usage where product_id=any(targets) and state='reserved') then raise exception 'Resolve generation reservations before changing facts';end if;
 if action='brand_edit' then
  update social_brands set name=trim(payload->>'name'),facts=trim(payload->>'facts'),version=version+1 where id=ident;
 else
  update social_products set name=trim(payload->>'name'),facts=trim(payload->>'facts'),version=version+1 where id=ident;
 end if;
 update social_jobs j set state='cancelled' from social_variants v where j.variant_id=v.id and v.product_id=any(targets) and j.state='scheduled';
 update social_variants set version=version+1,approved_version=null,approved_by=null,state='changes_requested',content_hash=encode(sha256(convert_to(content_hash||':facts:'||(version+1)::text,'UTF8')),'hex') where product_id=any(targets);
 insert into social_audit(workspace_id,actor,action,reference) values(w,auth.uid(),action,ident::text);
 insert into social_notifications(workspace_id,message) values(w,'Confirmed facts changed. Affected unpublished captions need manual review and fresh approval; captions were not automatically rewritten.');
 return '{}'::jsonb;
end$$;
revoke all on function social_command(text,jsonb) from public,anon;
grant execute on function social_command(text,jsonb) to authenticated;
