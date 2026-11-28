-- UX-BUILD-EVENTFEEDBACK-1128-925: player feedback CLAIMS on events. Never writes events.*. Service-role only.
-- Rollback SQL: drop table if exists public.event_feedback;
create table if not exists public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_is_anonymous boolean not null default false,
  field text not null check (field in ('title','year','location','description','image')),
  current_value text,
  proposed_value text,
  image_reasons text[],
  comment text check (comment is null or char_length(comment) <= 1000),
  review_status text not null default 'pending' check (review_status in ('pending','supported','contradicted','inconclusive')),
  review_ref bigint references public.event_fact_checks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_feedback_shape check (
    (field = 'image' and proposed_value is null
       and (coalesce(array_length(image_reasons,1),0) > 0 or comment is not null)
       and (image_reasons is null or image_reasons <@ array['anachronism','wrong_place_culture','wrong_people_objects','does_not_match_description','looks_artificial','offensive_or_inappropriate','other']::text[]))
    or
    (field <> 'image' and image_reasons is null and proposed_value is not null
       and char_length(btrim(proposed_value)) between 1 and 1500)
  )
);
create unique index if not exists event_feedback_one_per_reporter_field on public.event_feedback (event_id, reporter_id, field) where reporter_id is not null;
create index if not exists event_feedback_event_status on public.event_feedback (event_id, review_status);
create index if not exists event_feedback_reporter_recent on public.event_feedback (reporter_id, updated_at desc);
alter table public.event_feedback enable row level security;
revoke all on public.event_feedback from anon, authenticated, public;
grant all on public.event_feedback to service_role;
