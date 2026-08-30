-- 創作者授權連線與使用者手動匯入。
-- access token 只存加密字串，永遠不透過前端查詢回傳；RLS 以 user_id 隔離。

create table if not exists public.instagram_creator_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instagram_user_id text not null,
  username text not null check (username ~ '^[A-Za-z0-9._]{1,30}$'),
  display_name text not null default '',
  access_token_ciphertext text not null,
  token_expires_at timestamptz,
  status text not null default 'CONNECTED' check (status in ('CONNECTED', 'ERROR', 'REVOKED')),
  last_synced_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, instagram_user_id)
);

create index if not exists instagram_creator_connections_user_idx
  on public.instagram_creator_connections (user_id, updated_at desc);

alter table public.viral_contents add column if not exists instagram_connection_id uuid references public.instagram_creator_connections(id) on delete set null;

create table if not exists public.manual_content_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  platform text not null default 'Instagram',
  creator_name text not null default '',
  creator_handle text not null default '',
  title text not null default '',
  niche text not null default '',
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  followers bigint check (followers is null or followers >= 0),
  views bigint check (views is null or views >= 0),
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  reposts bigint check (reposts is null or reposts >= 0),
  shares bigint check (shares is null or shares >= 0),
  summary text not null default '',
  comments_sample text not null default '',
  import_notes text not null default '',
  instagram_media_id text,
  connection_id uuid references public.instagram_creator_connections(id) on delete set null,
  published_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, source_url)
);

create unique index if not exists manual_content_imports_media_uidx
  on public.manual_content_imports (user_id, instagram_media_id)
  where instagram_media_id is not null;
create index if not exists manual_content_imports_user_idx
  on public.manual_content_imports (user_id, created_at desc);

drop trigger if exists instagram_creator_connections_updated_at on public.instagram_creator_connections;
create trigger instagram_creator_connections_updated_at
  before update on public.instagram_creator_connections
  for each row execute function public.set_updated_at();
drop trigger if exists manual_content_imports_updated_at on public.manual_content_imports;
create trigger manual_content_imports_updated_at
  before update on public.manual_content_imports
  for each row execute function public.set_updated_at();

revoke all on table public.instagram_creator_connections from anon;
revoke all on table public.instagram_creator_connections from authenticated;
grant select, insert, update, delete on table public.instagram_creator_connections to authenticated;
alter table public.instagram_creator_connections enable row level security;

drop policy if exists instagram_connections_select_own on public.instagram_creator_connections;
create policy instagram_connections_select_own
  on public.instagram_creator_connections for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists instagram_connections_insert_own on public.instagram_creator_connections;
create policy instagram_connections_insert_own
  on public.instagram_creator_connections for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists instagram_connections_update_own on public.instagram_creator_connections;
create policy instagram_connections_update_own
  on public.instagram_creator_connections for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists instagram_connections_delete_own on public.instagram_creator_connections;
create policy instagram_connections_delete_own
  on public.instagram_creator_connections for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.manual_content_imports from anon;
revoke all on table public.manual_content_imports from authenticated;
grant select, insert, update, delete on table public.manual_content_imports to authenticated;
alter table public.manual_content_imports enable row level security;

drop policy if exists manual_imports_select_own on public.manual_content_imports;
create policy manual_imports_select_own
  on public.manual_content_imports for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists manual_imports_insert_own on public.manual_content_imports;
create policy manual_imports_insert_own
  on public.manual_content_imports for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists manual_imports_update_own on public.manual_content_imports;
create policy manual_imports_update_own
  on public.manual_content_imports for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists manual_imports_delete_own on public.manual_content_imports;
create policy manual_imports_delete_own
  on public.manual_content_imports for delete to authenticated
  using ((select auth.uid()) = user_id);
