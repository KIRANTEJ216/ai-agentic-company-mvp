-- USD admission ledger. Provider-side key limits remain necessary for billing caps.
alter table social_workspaces add column ai_budget_usd numeric(14,6) not null default 0 check(ai_budget_usd>=0 and ai_budget_usd<=10000);
alter table social_workspaces add column ai_request_hold_usd numeric(14,6) not null default 0.1 check(ai_request_hold_usd>0 and ai_request_hold_usd<=100);
alter table social_usage add column held_usd numeric(14,6) not null default 0;
alter table social_usage add column actual_usd numeric(14,6) check(actual_usd>=0);
alter table social_usage add column provider_id text;
create unique index social_provider_charge_once on social_usage(provider_id) where provider_id is not null;
alter function social_command(text,jsonb) rename to social_command_v5;
revoke all on function social_command_v5(text,jsonb) from public,anon,authenticated;
create function social_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;cfg social_workspaces;used numeric;result jsonb;begin
 if action not in ('ai_budget','reserve') then return social_command_v5(action,payload);end if;
 w=(payload->>'workspace_id')::uuid;
 select * into cfg from social_workspaces where id=w for update;
 if auth.uid() is null or social_role(w) is null then raise exception 'Workspace access denied';end if;
 if action='ai_budget' then
  if social_role(w)<>'owner' then raise exception 'Owner required';end if;
  if payload->>'cap_usd' is null or payload->>'hold_usd' is null then raise exception 'Budget and per-request hold required';end if;
  update social_workspaces set ai_budget_usd=(payload->>'cap_usd')::numeric,ai_request_hold_usd=(payload->>'hold_usd')::numeric where id=w;
  insert into social_audit(workspace_id,actor,action) values(w,auth.uid(),action);
  return '{}'::jsonb;
 end if;
 if exists(select 1 from social_usage where id=(payload->>'request_id')::uuid) then return social_command_v5(action,payload);end if;
 select coalesce(sum(coalesce(actual_usd,held_usd)),0) into used from social_usage where workspace_id=w;
 if used+cfg.ai_request_hold_usd>cfg.ai_budget_usd then raise exception 'USD budget exhausted or unconfigured; reconcile uncertain holds or increase the owner budget';end if;
 result=social_command_v5(action,payload);
 update social_usage set held_usd=cfg.ai_request_hold_usd where id=(payload->>'request_id')::uuid;
 return result||jsonb_build_object('held_usd',cfg.ai_request_hold_usd);
end$$;
revoke all on function social_command(text,jsonb) from public,anon;
grant execute on function social_command(text,jsonb) to authenticated;
create function social_record_cost(request_id uuid,cost_usd numeric,generation_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u social_usage;w uuid;begin
 select workspace_id into w from social_usage where id=request_id;
 perform 1 from social_workspaces where id=w for update;
 select * into u from social_usage where id=request_id for update;
 if u.id is null or cost_usd is null or cost_usd<0 or cost_usd>100000 or cost_usd::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid provider cost';end if;
 if u.actual_usd is not null then
  if u.actual_usd<>ceil(cost_usd*1000000)/1000000 or u.provider_id is distinct from generation_id then raise exception 'Cost already recorded differently';end if;
  return;
 end if;
 update social_usage set actual_usd=ceil(cost_usd*1000000)/1000000,provider_id=generation_id where id=request_id;
 if cost_usd>u.held_usd then
  update social_workspaces set ai_budget_usd=0 where id=w;
  insert into social_notifications(workspace_id,message) values(w,'AI provider cost exceeded its reservation. AI admission disabled; operator must reconcile pricing.');
 end if;
end$$;
revoke all on function social_record_cost(uuid,numeric,text) from public,anon,authenticated;
grant execute on function social_record_cost(uuid,numeric,text) to service_role;
