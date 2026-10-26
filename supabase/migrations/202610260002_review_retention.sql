-- Additive migration; apply after 202610260001_social.sql.
alter table social_workspaces add column enquiry_retention_days integer check(enquiry_retention_days in (30,90,365));
create table social_reviews(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references social_workspaces,variant_id uuid not null references social_variants,version integer not null,actor uuid not null,kind text not null check(kind in ('comment','changes_requested','review_requested')),message text not null,created_at timestamptz not null default now());
alter table social_reviews enable row level security;
create policy social_review_read on social_reviews for select using(social_role(workspace_id) is not null);
grant select on social_reviews to authenticated;
revoke insert,update,delete on social_reviews from anon,authenticated;
-- No workspace FK: cleanup must survive tenant deletion. No client access.
create table social_storage_cleanup(id uuid primary key default gen_random_uuid(),object_key text not null unique,attempts integer not null default 0,last_error text,created_at timestamptz not null default now());
alter table social_storage_cleanup enable row level security;
revoke all on social_storage_cleanup from anon,authenticated;
grant all on social_storage_cleanup to service_role;

alter function social_command(text,jsonb) rename to social_command_v1;
revoke all on function social_command_v1(text,jsonb) from public,anon,authenticated;
create function social_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; r text; v social_variants; b social_brands; message text; result jsonb;
begin
 if action='workspace' then return social_command_v1(action,payload); end if;
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 w=(payload->>'workspace_id')::uuid;r=social_role(w);
 if r is null then raise exception 'Workspace access denied';end if;
 perform 1 from social_workspaces where id=w for update;
 if action in ('review_request','review_comment','request_changes') then
  select * into v from social_variants where id=(payload->>'variant_id')::uuid and workspace_id=w for update;
  if v.id is null then raise exception 'Post not found';end if;
  if v.version is distinct from (payload->>'version')::integer then raise exception 'Post changed; reload the latest version';end if;
  if action='review_request' and r='reviewer' then raise exception 'Editor required';end if;
  if action='request_changes' and r='editor' then raise exception 'Reviewer required';end if;
  if action<>'review_comment' and exists(select 1 from social_jobs where variant_id=v.id and state in ('publishing','confirming')) then raise exception 'Delivery in progress; reconcile first';end if;
  message=trim(coalesce(payload->>'message',''));
  if action='review_request' and message='' then message='Please review this version';end if;
  if length(message) not between 1 and 2000 then raise exception 'Feedback must contain 1 to 2000 characters';end if;
  if action<>'review_comment' then
   update social_jobs set state='cancelled' where variant_id=v.id and state='scheduled';
   update social_variants set approved_version=null,approved_by=null,state=case when action='review_request' then 'in_review' else 'changes_requested' end where id=v.id;
  end if;
  insert into social_reviews(workspace_id,variant_id,version,actor,kind,message) values(w,v.id,v.version,auth.uid(),case action when 'review_request' then 'review_requested' when 'request_changes' then 'changes_requested' else 'comment' end,message);
 elsif action='retention' then
  if r<>'owner' then raise exception 'Owner required';end if;
  update social_workspaces set enquiry_retention_days=nullif(payload->>'days','')::integer where id=w;
 elsif action='delete_enquiry' then
  if r<>'owner' then raise exception 'Owner required';end if;
  delete from social_enquiries where id=(payload->>'id')::uuid and workspace_id=w;
 elsif action='delete_workspace' then
  if r<>'owner' then raise exception 'Owner required';end if;
  if (payload->>'confirm_name') is distinct from (select name from social_workspaces where id=w) then raise exception 'Type the workspace name exactly';end if;
  if exists(select 1 from social_jobs where workspace_id=w and state in ('publishing','confirming')) or exists(select 1 from social_usage where workspace_id=w and state='reserved') then raise exception 'Resolve in-flight deliveries and generation reservations before deletion';end if;
  -- Storage bytes are removed by a durable cleanup worker after the SQL commit.
  insert into social_storage_cleanup(object_key) select object_key from social_products where workspace_id=w and object_key is not null on conflict do nothing;
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
  return jsonb_build_object('deleted',true,'storage_cleanup','queued');
 else return social_command_v1(action,payload);end if;
 insert into social_audit(workspace_id,actor,action,reference) values(w,auth.uid(),action,coalesce(payload->>'variant_id',payload->>'id'));
 return '{}'::jsonb;
end$$;
revoke all on function social_command(text,jsonb) from public,anon;
grant execute on function social_command(text,jsonb) to authenticated;
create function social_maintenance() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare removed integer;begin
 delete from social_enquiries e using social_workspaces w where e.workspace_id=w.id and w.enquiry_retention_days is not null and e.created_at<now()-make_interval(days=>w.enquiry_retention_days);
 get diagnostics removed=row_count;
 return removed;
end$$;
revoke all on function social_maintenance() from public,anon,authenticated;
grant execute on function social_maintenance() to service_role;
