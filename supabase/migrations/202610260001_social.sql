-- Apply with the Supabase SQL editor or CLI. Authentication remains Supabase Auth.
create table public.social_workspaces(id uuid primary key default gen_random_uuid(), name text not null, owner_id uuid not null unique references auth.users, allowance integer not null default 20 check(allowance>=0), paused boolean not null default false, created_at timestamptz not null default now());
create table public.social_members(workspace_id uuid references public.social_workspaces on delete cascade, user_id uuid references auth.users, role text not null check(role in ('owner','editor','reviewer')), primary key(workspace_id,user_id));
create function public.social_role(w uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select role from social_members where workspace_id=w and user_id=auth.uid()$$;
create table public.social_brands(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, name text not null, facts text not null, voice text not null default '', locale text not null default 'English', timezone text not null default 'Asia/Kolkata', created_at timestamptz default now());
create table public.social_products(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, brand_id uuid not null references public.social_brands, name text not null, facts text not null, object_key text, checksum text, mime text, created_at timestamptz default now());
create table public.social_variants(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, product_id uuid not null references public.social_products, channel text not null check(channel in ('instagram','facebook')), caption text not null, version integer not null default 1, content_hash text not null, approved_version integer, approved_by uuid, state text not null default 'draft', created_at timestamptz default now());
create table public.social_jobs(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, variant_id uuid not null references public.social_variants, version integer not null, scheduled_at timestamptz not null, state text not null default 'scheduled', attempts integer not null default 0, lease uuid, lease_until timestamptz, next_at timestamptz not null default now(), remote_id text, remote_url text, error text, created_at timestamptz default now());
create unique index social_one_active_job on social_jobs(variant_id) where state in ('scheduled','publishing','confirming');
create table public.social_usage(id uuid primary key, workspace_id uuid not null references public.social_workspaces, product_id uuid not null references public.social_products, state text not null default 'reserved', units integer not null default 1, result jsonb, created_at timestamptz default now());
create table public.social_enquiries(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, name text not null, contact text not null default '', source text not null default 'Owner entered', variant_id uuid references public.social_variants, stage text not null default 'new' check(stage in ('new','qualified','booked','won','lost')), follow_up date, created_at timestamptz default now());
create table public.social_audit(id bigint generated always as identity primary key, workspace_id uuid not null references public.social_workspaces, actor uuid, action text not null, reference text, created_at timestamptz default now());
create table public.social_notifications(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, message text not null, created_at timestamptz default now());
create table public.social_metrics(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.social_workspaces, variant_id uuid references public.social_variants, metric text not null, value numeric, definition text not null, observed_at timestamptz not null default now());

alter table social_workspaces enable row level security;
create policy social_workspace_read on social_workspaces for select using (social_role(id) is not null);
alter table social_members enable row level security;
create policy social_member_read on social_members for select using (social_role(workspace_id) is not null);
do $$declare t text; begin foreach t in array array['social_brands','social_products','social_variants','social_jobs','social_usage','social_enquiries','social_audit','social_notifications','social_metrics'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy social_read on %I for select using (social_role(workspace_id) is not null)',t);
end loop; end$$;
-- No client INSERT/UPDATE/DELETE policies. All writes enforce roles and transactions here.
create function public.social_command(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; r text; b social_brands; p social_products; v social_variants; j social_jobs; u social_usage; ident uuid; result jsonb; cap text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if action='workspace' then
  if length(trim(payload->>'name')) not between 1 and 120 then raise exception 'Workspace name required'; end if;
  -- Prevent accidental repeated bootstrap and unbounded allowance creation by the UI.
  if exists(select 1 from social_workspaces where owner_id=auth.uid()) then raise exception 'You already own a workspace'; end if;
  insert into social_workspaces(name,owner_id) values(payload->>'name',auth.uid()) returning id into w;
  insert into social_members values(w,auth.uid(),'owner'); return jsonb_build_object('id',w);
 end if;
 w=(payload->>'workspace_id')::uuid; r=social_role(w);
 if r is null then raise exception 'Workspace access denied'; end if;
 -- Lock workspace to serialize allowance reservations and workspace state changes.
 perform 1 from social_workspaces where id=w for update;
 if action='settings' then
  if r<>'owner' then raise exception 'Owner required'; end if;
  update social_workspaces set paused=(payload->>'paused')::boolean where id=w;
 elsif action='member' then
  if r<>'owner' or payload->>'role' not in ('editor','reviewer') then raise exception 'Owner required; choose editor or reviewer'; end if;
  if (payload->>'user_id')::uuid=auth.uid() then raise exception 'Cannot replace owner'; end if;
  insert into social_members values(w,(payload->>'user_id')::uuid,payload->>'role') on conflict(workspace_id,user_id) do update set role=excluded.role;
 elsif action='brand' then
  if r='reviewer' then raise exception 'Editor required'; end if;
  if length(trim(payload->>'name')) not between 1 and 120 or length(trim(payload->>'facts')) not between 1 and 6000 then raise exception 'Name and confirmed facts required'; end if;
  insert into social_brands(workspace_id,name,facts,voice,locale,timezone) values(w,payload->>'name',payload->>'facts',coalesce(payload->>'voice',''),coalesce(payload->>'locale','English'),coalesce(payload->>'timezone','Asia/Kolkata')) returning to_jsonb(social_brands.*) into result;
 elsif action='asset' then
  if r='reviewer' then raise exception 'Editor required'; end if;
  select * into p from social_products where id=(payload->>'product_id')::uuid and workspace_id=w for update;
  if p.id is null then raise exception 'Product not found'; end if;
  if exists(select 1 from social_variants where product_id=p.id) then raise exception 'Image locked after drafting; create a new product version'; end if;
  if payload->>'object_key' not like w::text||'/'||p.id::text||'/%' then raise exception 'Invalid asset path'; end if;
  update social_products set object_key=payload->>'object_key',checksum=payload->>'checksum',mime=payload->>'mime' where id=p.id;
 elsif action='product' then
  if r='reviewer' then raise exception 'Editor required'; end if;
  select * into b from social_brands where id=(payload->>'brand_id')::uuid and workspace_id=w;
  if b.id is null or length(trim(payload->>'name')) not between 1 and 120 or length(trim(payload->>'facts')) not between 1 and 6000 then raise exception 'Brand, product name and facts required'; end if;
  insert into social_products(workspace_id,brand_id,name,facts) values(w,b.id,payload->>'name',payload->>'facts') returning to_jsonb(social_products.*) into result;
 elsif action in ('draft','reserve') then
  if r='reviewer' then raise exception 'Editor required'; end if;
  select * into p from social_products where id=(payload->>'product_id')::uuid and workspace_id=w;
  if p.id is null then raise exception 'Product not found'; end if;
  if action='reserve' then
   ident=(payload->>'request_id')::uuid;
   select * into u from social_usage where id=ident;
   if u.id is not null then
    if u.workspace_id<>w or u.product_id<>p.id then raise exception 'Request ID conflict'; end if;
    return to_jsonb(u);
   end if;
   if (select allowance from social_workspaces where id=w)<1 then raise exception 'Generation allowance exhausted'; end if;
   update social_workspaces set allowance=allowance-1 where id=w;
   insert into social_usage(id,workspace_id,product_id) values(ident,w,p.id) returning to_jsonb(social_usage.*) into result;
  else
   cap=trim(payload->>'caption');
   if cap is null or length(cap) not between 1 and 2200 then raise exception 'Caption must have 1 to 2200 characters'; end if;
   insert into social_variants(workspace_id,product_id,channel,caption,content_hash) values(w,p.id,payload->>'channel',cap,encode(sha256(convert_to(cap||p.id::text||coalesce(p.checksum,''),'UTF8')),'hex')) returning to_jsonb(social_variants.*) into result;
  end if;
 elsif action in ('edit','approve','schedule','cancel','retry') then
  select * into v from social_variants where id=(payload->>'variant_id')::uuid and workspace_id=w for update;
  if v.id is null then raise exception 'Post not found'; end if;
  if action='approve' then
   if r not in ('owner','reviewer') then raise exception 'Reviewer required'; end if;
   if v.version<>(payload->>'version')::integer then raise exception 'Post changed; review again'; end if;
   update social_variants set approved_version=version, approved_by=auth.uid(), state='approved' where id=v.id;
  elsif action='edit' then
   if r='reviewer' then raise exception 'Editor required'; end if;
   if v.version<>(payload->>'version')::integer then raise exception 'Post changed; reload before editing'; end if;
   if exists(select 1 from social_jobs where variant_id=v.id and state in ('publishing','confirming')) then raise exception 'Delivery in progress; reconcile before editing'; end if;
   cap=trim(payload->>'caption');
   if cap is null or length(cap) not between 1 and 2200 then raise exception 'Caption must have 1 to 2200 characters'; end if;
   update social_jobs set state='cancelled',lease=null where variant_id=v.id and state='scheduled';
   update social_variants set caption=cap,version=version+1,content_hash=encode(sha256(convert_to(cap||product_id::text,'UTF8')),'hex'),approved_version=null,approved_by=null,state='draft' where id=v.id;
  elsif action='schedule' then
   if r='reviewer' then raise exception 'Editor required'; end if;
   if v.approved_version is distinct from v.version then raise exception 'Approve current version first'; end if;
   if (payload->>'scheduled_at')::timestamptz<now() then raise exception 'Choose a future time'; end if;
   if exists(select 1 from social_jobs where variant_id=v.id and state in ('publishing','confirming','published')) then raise exception 'Already delivered or in progress'; end if;
   update social_jobs set state='cancelled' where variant_id=v.id and state='scheduled';
   insert into social_jobs(workspace_id,variant_id,version,scheduled_at) values(w,v.id,v.version,(payload->>'scheduled_at')::timestamptz);
   update social_variants set state='scheduled' where id=v.id;
  elsif action='cancel' then
   if r='reviewer' then raise exception 'Editor required'; end if;
   if exists(select 1 from social_jobs where variant_id=v.id and state in ('publishing','confirming')) then raise exception 'Delivery in progress'; end if;
   update social_jobs set state='cancelled' where variant_id=v.id and state='scheduled';
   update social_variants set state=case when approved_version=version then 'approved' else 'draft' end where id=v.id;
  else
   if r='reviewer' then raise exception 'Editor required'; end if;
   select * into j from social_jobs where variant_id=v.id and state='failed' order by created_at desc limit 1;
   if j.id is null or v.approved_version is distinct from v.version then raise exception 'No retryable approved job'; end if;
   update social_jobs set state='scheduled',attempts=0,next_at=now(),error=null where id=j.id;
   update social_variants set state='scheduled' where id=v.id;
  end if;
 elsif action='enquiry' then
  if r='reviewer' then raise exception 'Editor required'; end if;
  if length(trim(payload->>'name')) not between 1 and 200 then raise exception 'Name required'; end if;
  ident=nullif(payload->>'variant_id','')::uuid;
  if ident is not null and not exists(select 1 from social_variants where id=ident and workspace_id=w) then raise exception 'Invalid source post'; end if;
  insert into social_enquiries(workspace_id,name,contact,variant_id,stage,follow_up) values(w,payload->>'name',coalesce(payload->>'contact',''),ident,coalesce(payload->>'stage','new'),nullif(payload->>'follow_up','')::date);
 elsif action='enquiry_stage' then
  if r='reviewer' then raise exception 'Editor required'; end if;
  update social_enquiries set stage=payload->>'stage',follow_up=nullif(payload->>'follow_up','')::date where id=(payload->>'id')::uuid and workspace_id=w;
 else raise exception 'Unknown action'; end if;
 insert into social_audit(workspace_id,actor,action,reference) values(w,auth.uid(),action,coalesce(payload->>'variant_id',payload->>'product_id',payload->>'id'));
 return coalesce(result,'{}'::jsonb);
end$$;
revoke all on function social_command(text,jsonb) from public;
grant execute on function social_command(text,jsonb) to authenticated;
revoke all on function social_role(uuid) from public;
grant execute on function social_role(uuid) to authenticated;
-- Service-only settlement: a timed-out generation remains reserved until operator reconciliation.
create function public.social_settle(request_id uuid, output jsonb, refund boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u social_usage; begin
 select * into u from social_usage where id=request_id for update;
 if u.id is null or u.state<>'reserved' then return; end if;
 update social_usage set state=case when refund then 'refunded' else 'settled' end,result=output where id=u.id;
 if refund then update social_workspaces set allowance=allowance+u.units where id=u.workspace_id; end if;
end$$;
create function public.social_claim() returns setof social_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- A worker may have sent externally before crashing. Never blindly resend an expired lease.
 with expired as (update social_jobs set state='confirming',error='Worker lease expired; operator must reconcile',lease=null where state='publishing' and lease_until<now() returning workspace_id,variant_id)
 insert into social_notifications(workspace_id,message) select workspace_id,'Worker lease expired for post '||variant_id||'; verify destination before retrying' from expired;
 update social_variants v set state='confirming' where exists(select 1 from social_jobs j where j.variant_id=v.id and j.state='confirming');
 return query with candidate as (
 select j.id from social_jobs j join social_workspaces w on w.id=j.workspace_id join social_variants v on v.id=j.variant_id
 where j.state='scheduled' and j.scheduled_at<=now() and j.next_at<=now() and not w.paused and v.approved_version=j.version and v.version=j.version
 order by j.scheduled_at for update of w,v,j skip locked limit 1)
 update social_jobs j set state='publishing',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 from candidate c where j.id=c.id returning j.*;
end$$;
create function public.social_finish(job_id uuid, lease_id uuid, outcome text, detail text, remote text default null, url text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j social_jobs; begin
 select * into j from social_jobs where id=job_id and lease=lease_id and state='publishing' for update;
 if j.id is null then raise exception 'Stale worker lease'; end if;
 if outcome not in ('published','failed','confirming','scheduled') then raise exception 'Invalid outcome'; end if;
 update social_jobs set state=outcome,error=detail,remote_id=remote,remote_url=url,lease=null,lease_until=null,next_at=now()+make_interval(secs=>least(3600,30*power(2,j.attempts)::int)) where id=j.id;
 update social_variants set state=outcome where id=j.variant_id;
 if outcome in ('failed','confirming') then insert into social_notifications(workspace_id,message) values(j.workspace_id,'Post '||j.variant_id||': '||coalesce(detail,outcome)); end if;
 insert into social_audit(workspace_id,action,reference) values(j.workspace_id,'delivery_'||outcome,j.id::text);
end$$;
revoke all on function social_settle(uuid,jsonb,boolean),social_claim(),social_finish(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function social_settle(uuid,jsonb,boolean),social_claim(),social_finish(uuid,uuid,text,text,text,text) to service_role;
alter table social_usage add column started_at timestamptz;
create function public.social_start_generation(request_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update social_usage set started_at=now() where id=request_id and state='reserved' and started_at is null;
 return found;
end$$;
revoke all on function social_start_generation(uuid) from public,anon,authenticated;
grant execute on function social_start_generation(uuid) to service_role;
-- Explicit grants also make this migration portable across Supabase default privilege settings.
grant select on social_workspaces,social_members,social_brands,social_products,social_variants,social_jobs,social_usage,social_enquiries,social_audit,social_notifications,social_metrics to authenticated;
revoke insert,update,delete,truncate on social_workspaces,social_members,social_brands,social_products,social_variants,social_jobs,social_usage,social_enquiries,social_audit,social_notifications,social_metrics from authenticated,anon;
alter table social_notifications add column email_state text not null default 'pending';
alter table social_notifications add column email_lease uuid;
alter table social_notifications add column email_until timestamptz;
create function public.social_email_claim() returns setof social_notifications language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update social_notifications set email_state='uncertain',email_lease=null where email_state='sending' and email_until<now();
 return query with candidate as (select id from social_notifications where email_state='pending' order by created_at for update skip locked limit 1)
 update social_notifications n set email_state='sending',email_lease=gen_random_uuid(),email_until=now()+interval '5 minutes' from candidate c where n.id=c.id returning n.*;
end$$;
revoke all on function social_email_claim() from public,anon,authenticated;
grant execute on function social_email_claim() to service_role;
-- Restricted operator reconciliation. Browser users cannot assert verified delivery.
create function public.social_reconcile(job_id uuid, verified_remote_id text, verified_url text, not_published boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j social_jobs; begin
 select * into j from social_jobs where id=job_id and state='confirming' for update;
 if j.id is null then raise exception 'No uncertain job'; end if;
 if not not_published and (coalesce(verified_remote_id,'')='' or coalesce(verified_url,'') not like 'https://%') then raise exception 'Verified remote evidence required'; end if;
 update social_jobs set state=case when not_published then 'failed' else 'published' end,remote_id=verified_remote_id,remote_url=verified_url,error=case when not_published then 'Operator confirmed no publication; retry is available' else null end where id=j.id;
 update social_variants set state=case when not_published then 'failed' else 'published' end where id=j.variant_id;
 insert into social_audit(workspace_id,action,reference) values(j.workspace_id,case when not_published then 'operator_confirmed_no_post' else 'operator_verified_remote_post' end,j.id::text);
end$$;
revoke all on function social_reconcile(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function social_reconcile(uuid,text,text,boolean) to service_role;
