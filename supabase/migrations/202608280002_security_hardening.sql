-- 雲端基礎 migration 的安全與效能加固。
-- 函式固定 search_path，避免依賴可變的 session search_path；外鍵補上索引。

alter function public.set_updated_at() set search_path = public;
alter function public.is_admin() set search_path = public;
create index if not exists viral_contents_created_by_idx on public.viral_contents (created_by);
