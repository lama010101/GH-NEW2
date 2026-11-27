-- EDQ-BUILD-CORRECTIONLOOP-1126-898
-- Correction candidates + apply/revert audit log + SKIP LOCKED claim RPC.
-- Additive only. Target: prod gzvixlvkwjsrtmtybtkf.

create table public.event_correction_candidates (
  event_id uuid primary key references public.events(id) on delete cascade,
  source_check_id bigint not null references public.event_fact_checks(id),
  proposed jsonb not null,
  state text not null default 'open' check (state in ('open','claimed','verified','applied','skipped','disputed','reverted')),
  skip_reason text,
  priority int not null default 0,
  claimed_by text, claimed_at timestamptz, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index event_correction_candidates_open_idx on public.event_correction_candidates (priority desc, event_id) where state = 'open';
create table public.event_correction_log (
  id bigserial primary key, run_id text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  action text not null check (action in ('applied','reverted','quarantined')),
  before jsonb not null, after jsonb not null,
  check_id bigint references public.event_fact_checks(id),
  applied_by text not null, created_at timestamptz not null default now(),
  reverted_by_log_id bigint);
create index event_correction_log_event_idx on public.event_correction_log (event_id, created_at desc);
alter table public.event_correction_candidates enable row level security;
alter table public.event_correction_log enable row level security;
revoke all on public.event_correction_candidates, public.event_correction_log from anon, authenticated;
create or replace function public.claim_correction_events(p_worker text, p_n int default 8, p_lease_minutes int default 30)
returns table(event_id uuid) language sql security definer set search_path = public as $$
  with picked as (select c.event_id from public.event_correction_candidates c
    where c.state in ('open','claimed') and (c.lease_until is null or c.lease_until < now())
    order by c.priority desc, c.event_id limit p_n for update skip locked)
  update public.event_correction_candidates c set state='claimed', claimed_by=p_worker, claimed_at=now(),
    lease_until=now()+make_interval(mins=>p_lease_minutes), updated_at=now()
  from picked where c.event_id = picked.event_id returning c.event_id; $$;
revoke all on function public.claim_correction_events(text,int,int) from public, anon, authenticated;

-- ROLLBACK SQL:
-- drop function public.claim_correction_events(text,int,int);
-- drop table public.event_correction_log;
-- drop table public.event_correction_candidates;
-- delete from supabase_migrations.schema_migrations where version='20261126100000';
