-- EDQ-BUILD-REVIEWQUEUE-1124-872
-- Review queue + fact-check ledger + reliability view + claim function.
-- Additive only. Target: prod gzvixlvkwjsrtmtybtkf.

create table public.event_fact_checks (
  id bigserial primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  run_id text not null,
  protocol text not null,
  verdict text not null check (verdict in ('TRUE','FALSE','WRONG_YEAR','WRONG_PLACE','MISNAMED','NOT_REAL','GENERIC','UNVERIFIABLE','AMBIGUOUS')),
  title_ok boolean, year_ok boolean, place_ok boolean,
  n_sources smallint not null default 0 check (n_sources >= 0),
  sources jsonb not null default '[]'::jsonb,
  corrected jsonb,
  needs_recheck boolean not null default false,
  reliability smallint not null check (reliability between 0 and 100),
  checker text not null,
  checked_at timestamptz not null default now()
);
create index event_fact_checks_event_idx on public.event_fact_checks (event_id, checked_at desc, id desc);
alter table public.event_fact_checks enable row level security;

create table public.event_review_queue (
  event_id uuid primary key references public.events(id) on delete cascade,
  priority int not null default 0,
  claimed_by text,
  claimed_at timestamptz,
  lease_until timestamptz,
  done_at timestamptz
);
create index event_review_queue_open_idx on public.event_review_queue (priority desc, event_id) where done_at is null;
alter table public.event_review_queue enable row level security;

create or replace view public.event_reliability with (security_invoker = true) as
select distinct on (event_id) event_id, verdict, reliability, n_sources, needs_recheck, protocol, checked_at
from public.event_fact_checks
order by event_id, checked_at desc, id desc;

create or replace function public.claim_review_events(p_worker text, p_n int default 10, p_lease_minutes int default 30)
returns table(event_id uuid) language sql security definer set search_path = public as $$
  with picked as (
    select q.event_id from public.event_review_queue q
    where q.done_at is null and (q.lease_until is null or q.lease_until < now())
    order by q.priority desc, q.event_id
    limit p_n for update skip locked)
  update public.event_review_queue q
     set claimed_by = p_worker, claimed_at = now(), lease_until = now() + make_interval(mins => p_lease_minutes)
    from picked where q.event_id = picked.event_id
  returning q.event_id;
$$;
revoke all on function public.claim_review_events(text,int,int) from public, anon, authenticated;
revoke all on public.event_fact_checks, public.event_review_queue, public.event_reliability from anon, authenticated;
