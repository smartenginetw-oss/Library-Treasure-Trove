-- 藏書閣寶典雲端基礎資料模型
-- 這份 migration 可在 Supabase SQL Editor 或 Supabase CLI migration 流程執行。
-- 所有使用者資料以 auth.uid() 隔離；service_role 只供伺服器端使用。

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'), false);
$$;

create table if not exists public.creator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '內容創作者',
  primary_niche text not null default '',
  audience_age text not null default '',
  audience_identity text not null default '',
  audience_interests text not null default '',
  audience_problem text not null default '',
  audience_desired_result text not null default '',
  content_goal text not null default '',
  platforms text[] not null default '{}',
  outlier_threshold numeric not null default 4 check (outlier_threshold > 0 and outlier_threshold <= 100),
  custom_categories text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.viral_contents (
  id text primary key,
  title text not null,
  creator_name text not null default '',
  creator_handle text not null default '',
  platform text not null default '',
  niche text not null default '',
  followers bigint,
  views bigint,
  likes bigint,
  comments bigint,
  velocity numeric,
  freshness numeric,
  repeated_format numeric,
  traffic_codes text[] not null default '{}',
  hook_type text not null default '',
  cover_type text not null default '',
  format text not null default '',
  summary text not null default '',
  comments_sample text not null default '',
  source_url text not null default '',
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.topics (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_audience text not null default '',
  content_theme text not null default '',
  traffic_codes text[] not null default '{}',
  hook text not null default '',
  hook_type text not null default '',
  why_it_works text not null default '',
  content_structure text[] not null default '{}',
  cta text not null default '',
  series_ideas text[] not null default '{}',
  differentiation text not null default '',
  copying_risk text not null default '',
  viral_potential integer not null default 0 check (viral_potential >= 0 and viral_potential <= 100),
  status text not null default 'IDEA' check (status in ('IDEA','SAVED','PLANNED','FILMED','PUBLISHED','ARCHIVED')),
  source_viral_content_id text,
  content_category text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.formulas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  formula text not null default '',
  content_theme text not null default '',
  traffic_codes text[] not null default '{}',
  hook_type text not null default '',
  source_viral_content_id text,
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.viral_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  viral_content_id text not null,
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saved_viral_contents (
  user_id uuid not null references auth.users(id) on delete cascade,
  viral_content_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, viral_content_id)
);

drop trigger if exists creator_profiles_updated_at on public.creator_profiles;
create trigger creator_profiles_updated_at before update on public.creator_profiles for each row execute function public.set_updated_at();
drop trigger if exists viral_contents_updated_at on public.viral_contents;
create trigger viral_contents_updated_at before update on public.viral_contents for each row execute function public.set_updated_at();
drop trigger if exists topics_updated_at on public.topics;
create trigger topics_updated_at before update on public.topics for each row execute function public.set_updated_at();
drop trigger if exists formulas_updated_at on public.formulas;
create trigger formulas_updated_at before update on public.formulas for each row execute function public.set_updated_at();
drop trigger if exists viral_analyses_updated_at on public.viral_analyses;
create trigger viral_analyses_updated_at before update on public.viral_analyses for each row execute function public.set_updated_at();

create index if not exists topics_user_updated_idx on public.topics (user_id, updated_at desc);
create index if not exists formulas_user_updated_idx on public.formulas (user_id, updated_at desc);
create index if not exists viral_contents_active_idx on public.viral_contents (archived, created_at desc);
create index if not exists viral_analyses_user_idx on public.viral_analyses (user_id, created_at desc);

-- Exposed public schema: revoke default broad access, then grant only intended operations.
revoke all on table public.creator_profiles, public.viral_contents, public.topics, public.formulas, public.viral_analyses, public.saved_viral_contents from anon;
revoke all on table public.creator_profiles, public.viral_contents, public.topics, public.formulas, public.viral_analyses, public.saved_viral_contents from authenticated;
grant select, insert, update, delete on table public.creator_profiles, public.topics, public.formulas, public.viral_analyses, public.saved_viral_contents to authenticated;
grant select on table public.viral_contents to authenticated;

alter table public.creator_profiles enable row level security;
alter table public.viral_contents enable row level security;
alter table public.topics enable row level security;
alter table public.formulas enable row level security;
alter table public.viral_analyses enable row level security;
alter table public.saved_viral_contents enable row level security;

drop policy if exists creator_profiles_select_own on public.creator_profiles;
create policy creator_profiles_select_own on public.creator_profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists creator_profiles_insert_own on public.creator_profiles;
create policy creator_profiles_insert_own on public.creator_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists creator_profiles_update_own on public.creator_profiles;
create policy creator_profiles_update_own on public.creator_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists creator_profiles_delete_own on public.creator_profiles;
create policy creator_profiles_delete_own on public.creator_profiles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists viral_contents_select_available on public.viral_contents;
create policy viral_contents_select_available on public.viral_contents for select to authenticated using (archived = false or public.is_admin());
drop policy if exists viral_contents_insert_admin on public.viral_contents;
create policy viral_contents_insert_admin on public.viral_contents for insert to authenticated with check (public.is_admin());
drop policy if exists viral_contents_update_admin on public.viral_contents;
create policy viral_contents_update_admin on public.viral_contents for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists viral_contents_delete_admin on public.viral_contents;
create policy viral_contents_delete_admin on public.viral_contents for delete to authenticated using (public.is_admin());

drop policy if exists topics_select_own on public.topics;
create policy topics_select_own on public.topics for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists topics_insert_own on public.topics;
create policy topics_insert_own on public.topics for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists topics_update_own on public.topics;
create policy topics_update_own on public.topics for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists topics_delete_own on public.topics;
create policy topics_delete_own on public.topics for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists formulas_select_own on public.formulas;
create policy formulas_select_own on public.formulas for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists formulas_insert_own on public.formulas;
create policy formulas_insert_own on public.formulas for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists formulas_update_own on public.formulas;
create policy formulas_update_own on public.formulas for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists formulas_delete_own on public.formulas;
create policy formulas_delete_own on public.formulas for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists viral_analyses_select_own on public.viral_analyses;
create policy viral_analyses_select_own on public.viral_analyses for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists viral_analyses_insert_own on public.viral_analyses;
create policy viral_analyses_insert_own on public.viral_analyses for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists viral_analyses_update_own on public.viral_analyses;
create policy viral_analyses_update_own on public.viral_analyses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists viral_analyses_delete_own on public.viral_analyses;
create policy viral_analyses_delete_own on public.viral_analyses for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists saved_viral_contents_select_own on public.saved_viral_contents;
create policy saved_viral_contents_select_own on public.saved_viral_contents for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists saved_viral_contents_insert_own on public.saved_viral_contents;
create policy saved_viral_contents_insert_own on public.saved_viral_contents for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists saved_viral_contents_delete_own on public.saved_viral_contents;
create policy saved_viral_contents_delete_own on public.saved_viral_contents for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
