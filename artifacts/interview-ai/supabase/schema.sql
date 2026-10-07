-- Run this script in Supabase Dashboard > SQL Editor for the connected project.
-- All candidate records are owner-scoped with RLS; never use a service-role key
-- from the app or browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text not null unique,
  preferred_role text,
  preferred_programming_language text,
  preferred_interview_language text not null default 'English'
    check (preferred_interview_language in ('English', 'Telugu', 'Hindi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_role text not null,
  interview_type text not null,
  programming_language text not null,
  difficulty text not null,
  experience_level text not null,
  interview_language text not null,
  interviewer_persona text not null,
  voice_enabled boolean not null default false,
  number_of_questions integer not null check (number_of_questions in (5, 10, 15, 20)),
  total_marks integer not null check (total_marks in (50, 100, 150, 200)),
  time_limit_minutes integer,
  resume_context text,
  job_description text,
  marks_obtained integer not null default 0,
  percentage numeric(5, 2) not null default 0,
  overall_score numeric(5, 2) not null default 0,
  performance_rating text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  report_data jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_number integer not null,
  question_text text not null,
  question_type text not null default 'technical',
  topic text not null,
  difficulty text not null,
  max_marks integer not null,
  created_at timestamptz not null default now(),
  unique (interview_id, question_number)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer_text text not null default '',
  skipped boolean not null default false,
  marks_obtained integer not null default 0,
  technical_score numeric(5, 2) not null default 0,
  answer_quality_score numeric(5, 2) not null default 0,
  relevance_score numeric(5, 2) not null default 0,
  communication_score numeric(5, 2) not null default 0,
  clarity_score numeric(5, 2) not null default 0,
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  improvement_tips jsonb not null default '[]'::jsonb,
  sample_answer text not null default '',
  topics_to_revise jsonb not null default '[]'::jsonb,
  performance_category text not null default 'Needs Improvement',
  evaluation_status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete cascade,
  topic text not null,
  description text not null,
  priority text not null default 'Medium',
  practice_task text not null,
  estimated_minutes integer not null default 30,
  status text not null default 'Not Started'
    check (status in ('Not Started', 'In Progress', 'Completed')),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interviews_user_created_idx
  on public.interviews(user_id, created_at desc);
create index if not exists questions_interview_idx
  on public.questions(interview_id, question_number);
create index if not exists answers_user_created_idx
  on public.answers(user_id, created_at desc);
create index if not exists roadmap_user_order_idx
  on public.roadmap_items(user_id, order_index);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists roadmap_items_set_updated_at on public.roadmap_items;
create trigger roadmap_items_set_updated_at before update on public.roadmap_items
for each row execute function public.set_updated_at();

create or replace function public.create_interviewai_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if requested_username = '' then
    requested_username := 'candidate_' || left(new.id::text, 8);
  end if;
  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    requested_username
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists interviewai_user_created on auth.users;
create trigger interviewai_user_created
after insert on auth.users
for each row execute procedure public.create_interviewai_profile();

alter table public.profiles enable row level security;
alter table public.interviews enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.roadmap_items enable row level security;

drop policy if exists "profile owner access" on public.profiles;
create policy "profile owner access" on public.profiles
for all to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "interview owner access" on public.interviews;
create policy "interview owner access" on public.interviews
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "question owner access" on public.questions;
create policy "question owner access" on public.questions
for all to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.interviews i
    where i.id = interview_id and i.user_id = (select auth.uid())
  )
);

drop policy if exists "answer owner access" on public.answers;
create policy "answer owner access" on public.answers
for all to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.questions q
    join public.interviews i on i.id = q.interview_id
    where q.id = question_id
      and q.user_id = (select auth.uid())
      and i.user_id = (select auth.uid())
  )
);

drop policy if exists "roadmap owner access" on public.roadmap_items;
create policy "roadmap owner access" on public.roadmap_items
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.profiles, public.interviews, public.questions,
  public.answers, public.roadmap_items from anon;
-- The read-only setup check needs to resolve the profiles relation. RLS has no
-- anon policy, so this grants no access to profile rows.
grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles, public.interviews,
  public.questions, public.answers, public.roadmap_items to authenticated;

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do update set public = false;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'resume owner access'
  ) then
    create policy "resume owner access" on storage.objects
    for all to authenticated
    using (
      bucket_id = 'resumes'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
      bucket_id = 'resumes'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end;
$$;
