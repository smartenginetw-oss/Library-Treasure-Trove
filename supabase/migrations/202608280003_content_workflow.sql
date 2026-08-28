-- 藏書閣寶典：定位資料卡、內容交付包與復盤工作流。
-- 這些欄位與資料表都以 user_id + RLS 隔離，payload 只保存該使用者自己的結構化內容。

alter table public.creator_profiles add column if not exists positioning_sentence text not null default '';
alter table public.creator_profiles add column if not exists creator_strengths text[] not null default '{}';
alter table public.creator_profiles add column if not exists experience_stories text[] not null default '{}';
alter table public.creator_profiles add column if not exists audience_questions text[] not null default '{}';
alter table public.creator_profiles add column if not exists content_taboos text[] not null default '{}';
alter table public.creator_profiles add column if not exists content_pillars jsonb not null default '[]'::jsonb;
alter table public.creator_profiles add column if not exists weekly_time text not null default '';
alter table public.creator_profiles add column if not exists available_tools text[] not null default '{}';

alter table public.topics add column if not exists angle text not null default '';
alter table public.topics add column if not exists topic_score jsonb not null default '{}'::jsonb;
alter table public.topics add column if not exists review_due_at timestamptz;

create table if not exists public.content_deliverables (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text,
  title text not null default '',
  angle text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','ARCHIVED')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.content_reviews (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text,
  topic_title text not null default '',
  published_at timestamptz,
  review_due_at timestamptz,
  reach bigint,
  watch_time text not null default '',
  saves bigint,
  shares bigint,
  dms bigint,
  variable text not null default '',
  diagnosis text not null default '',
  next_test text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.workflow_tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  day integer not null check (day between 1 and 7),
  title text not null default '',
  detail text not null default '',
  completed boolean not null default false,
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

drop trigger if exists content_deliverables_updated_at on public.content_deliverables;
create trigger content_deliverables_updated_at before update on public.content_deliverables for each row execute function public.set_updated_at();
drop trigger if exists content_reviews_updated_at on public.content_reviews;
create trigger content_reviews_updated_at before update on public.content_reviews for each row execute function public.set_updated_at();
drop trigger if exists workflow_tasks_updated_at on public.workflow_tasks;
create trigger workflow_tasks_updated_at before update on public.workflow_tasks for each row execute function public.set_updated_at();

create index if not exists content_deliverables_user_updated_idx on public.content_deliverables (user_id, updated_at desc);
create index if not exists content_reviews_user_due_idx on public.content_reviews (user_id, review_due_at);
create index if not exists workflow_tasks_user_day_idx on public.workflow_tasks (user_id, day);

revoke all on table public.content_deliverables, public.content_reviews, public.workflow_tasks from anon;
revoke all on table public.content_deliverables, public.content_reviews, public.workflow_tasks from authenticated;
grant select, insert, update, delete on table public.content_deliverables, public.content_reviews, public.workflow_tasks to authenticated;

alter table public.content_deliverables enable row level security;
alter table public.content_reviews enable row level security;
alter table public.workflow_tasks enable row level security;

drop policy if exists content_deliverables_select_own on public.content_deliverables;
create policy content_deliverables_select_own on public.content_deliverables for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists content_deliverables_insert_own on public.content_deliverables;
create policy content_deliverables_insert_own on public.content_deliverables for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists content_deliverables_update_own on public.content_deliverables;
create policy content_deliverables_update_own on public.content_deliverables for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists content_deliverables_delete_own on public.content_deliverables;
create policy content_deliverables_delete_own on public.content_deliverables for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists content_reviews_select_own on public.content_reviews;
create policy content_reviews_select_own on public.content_reviews for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists content_reviews_insert_own on public.content_reviews;
create policy content_reviews_insert_own on public.content_reviews for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists content_reviews_update_own on public.content_reviews;
create policy content_reviews_update_own on public.content_reviews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists content_reviews_delete_own on public.content_reviews;
create policy content_reviews_delete_own on public.content_reviews for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists workflow_tasks_select_own on public.workflow_tasks;
create policy workflow_tasks_select_own on public.workflow_tasks for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists workflow_tasks_insert_own on public.workflow_tasks;
create policy workflow_tasks_insert_own on public.workflow_tasks for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists workflow_tasks_update_own on public.workflow_tasks;
create policy workflow_tasks_update_own on public.workflow_tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists workflow_tasks_delete_own on public.workflow_tasks;
create policy workflow_tasks_delete_own on public.workflow_tasks for delete to authenticated using ((select auth.uid()) = user_id);
