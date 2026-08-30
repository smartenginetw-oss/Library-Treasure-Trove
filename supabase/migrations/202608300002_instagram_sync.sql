-- Instagram 官方 API 監測來源與排程同步欄位。
-- access token 只放在 Vercel 伺服器環境變數，不寫入資料庫或前端。

create table if not exists public.instagram_monitored_creators (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[A-Za-z0-9._]{1,30}$'),
  display_name text not null default '',
  niche text not null default '',
  source_url text not null default '',
  remote_user_id text not null default '',
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text not null default 'PENDING' check (last_sync_status in ('PENDING', 'SUCCESS', 'ERROR')),
  last_sync_error text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.viral_contents add column if not exists instagram_media_id text;
alter table public.viral_contents add column if not exists instagram_source_id uuid references public.instagram_monitored_creators(id) on delete set null;
alter table public.viral_contents add column if not exists published_at timestamptz;
alter table public.viral_contents add column if not exists last_synced_at timestamptz;
alter table public.viral_contents add column if not exists sync_source text not null default 'manual';

create unique index if not exists viral_contents_instagram_media_uidx
  on public.viral_contents (instagram_media_id)
  where instagram_media_id is not null;
create index if not exists viral_contents_instagram_source_idx
  on public.viral_contents (instagram_source_id, published_at desc);
create index if not exists instagram_monitored_creators_enabled_idx
  on public.instagram_monitored_creators (enabled, last_synced_at);

drop trigger if exists instagram_monitored_creators_updated_at on public.instagram_monitored_creators;
create trigger instagram_monitored_creators_updated_at
  before update on public.instagram_monitored_creators
  for each row execute function public.set_updated_at();

revoke all on table public.instagram_monitored_creators from anon;
revoke all on table public.instagram_monitored_creators from authenticated;
grant select, insert, update, delete on table public.instagram_monitored_creators to authenticated;

alter table public.instagram_monitored_creators enable row level security;

drop policy if exists instagram_sources_select_enabled on public.instagram_monitored_creators;
create policy instagram_sources_select_enabled
  on public.instagram_monitored_creators for select to authenticated
  using (enabled = true or public.is_admin());
drop policy if exists instagram_sources_insert_admin on public.instagram_monitored_creators;
create policy instagram_sources_insert_admin
  on public.instagram_monitored_creators for insert to authenticated
  with check (public.is_admin());
drop policy if exists instagram_sources_update_admin on public.instagram_monitored_creators;
create policy instagram_sources_update_admin
  on public.instagram_monitored_creators for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists instagram_sources_delete_admin on public.instagram_monitored_creators;
create policy instagram_sources_delete_admin
  on public.instagram_monitored_creators for delete to authenticated
  using (public.is_admin());

insert into public.instagram_monitored_creators (username, display_name, niche, source_url)
values
  ('ray_eat_food', '陳芃芃的美食天地', 'Food', 'https://www.instagram.com/ray_eat_food/'),
  ('77.food', '巨鳥胃77', 'Food', 'https://www.instagram.com/77.food/'),
  ('iris.love.food', '瑞斯', 'Food', 'https://www.instagram.com/iris.love.food/')
on conflict (username) do update
set display_name = excluded.display_name,
    niche = excluded.niche,
    source_url = excluded.source_url;
