-- Quarantine a workspace before physical deletion so in-flight uploads cannot orphan files.
alter table social_workspaces add column deletion_requested_at timestamptz;
create or replace function social_role(w uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select m.role from social_members m join social_workspaces s on s.id=m.workspace_id where m.workspace_id=w and m.user_id=auth.uid() and s.deletion_requested_at is null$$;
alter function social_command(text,jsonb) rename to social_command_v3;
revoke all on function social_command_v3(text,jsonb) from public,anon,authenticated;
create function social_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;begin
 if action<>'delete_workspace' then return social_command_v3(action,payload);end if;
 if auth.uid() is null then raise exception 'Sign in required';end if;
 w=(payload->>'workspace_id')::uuid;
 if social_role(w) is distinct from 'owner' then raise exception 'Owner required';end if;
 perform 1 from social_workspaces where id=w for update;
 if (payload->>'confirm_name') is distinct from (select name from social_workspaces where id=w) then raise exception 'Type the workspace name exactly';end if;
 if exists(select 1 from social_jobs where workspace_id=w and state in ('publishing','confirming')) or exists(select 1 from social_usage where workspace_id=w and state='reserved') then raise exception 'Resolve in-flight deliveries and generation reservations before deletion';end if;
 update social_jobs set state='cancelled' where workspace_id=w and state='scheduled';
 update social_workspaces set deletion_requested_at=now(),paused=true where id=w;
 return jsonb_build_object('deletion','queued','quarantine_minutes',10);
end$$;
revoke all on function social_command(text,jsonb) from public,anon;
grant execute on function social_command(text,jsonb) to authenticated;
create function social_purge_workspace(w uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from social_workspaces where id=w and deletion_requested_at<now()-interval '10 minutes' for update;
 if not found then raise exception 'Deletion quarantine not complete';end if;
 insert into social_storage_cleanup(object_key) select object_key from social_products where workspace_id=w and object_key is not null on conflict do nothing;
 insert into social_storage_cleanup(object_key) select workspace_id::text||'/'||product_id::text||'/'||id::text||'.original' from social_uploads where workspace_id=w on conflict do nothing;
 insert into social_storage_cleanup(object_key) select u.workspace_id::text||'/'||u.product_id::text||'/parts/'||u.id::text||'/'||p.part from social_uploads u join social_upload_parts p on p.upload_id=u.id where u.workspace_id=w on conflict do nothing;
 delete from social_uploads where workspace_id=w;
 delete from social_reviews where workspace_id=w;
 delete from social_metrics where workspace_id=w;
 delete from social_enquiries where workspace_id=w;
 delete from social_jobs where workspace_id=w;
 delete from social_usage where workspace_id=w;
 delete from social_variants where workspace_id=w;
 delete from social_products where workspace_id=w;
 delete from social_brands where workspace_id=w;
 delete from social_notifications where workspace_id=w;
 delete from social_audit where workspace_id=w;
 delete from social_members where workspace_id=w;
 delete from social_workspaces where id=w;
end$$;
revoke all on function social_purge_workspace(uuid) from public,anon,authenticated;
grant execute on function social_purge_workspace(uuid) to service_role;
alter function social_maintenance() rename to social_maintenance_v2;
revoke all on function social_maintenance_v2() from public,anon,authenticated,service_role;
create function social_maintenance() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;w uuid;begin
 n=social_maintenance_v2();
 for w in select id from social_workspaces where deletion_requested_at<now()-interval '10 minutes' order by deletion_requested_at limit 10 loop perform social_purge_workspace(w);end loop;
 return n;
end$$;
revoke all on function social_maintenance() from public,anon,authenticated;
grant execute on function social_maintenance() to service_role;
