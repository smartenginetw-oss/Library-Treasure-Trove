-- 使用者私有資料的 ID 可能來自本機種子或匯入備份，不能在全域單欄主鍵互相碰撞。
-- 以 user_id + id 作為複合主鍵，保留既有 API 的 upsert 行為並完成帳號隔離。

alter table public.topics drop constraint if exists topics_pkey;
alter table public.topics add primary key (user_id, id);

alter table public.formulas drop constraint if exists formulas_pkey;
alter table public.formulas add primary key (user_id, id);

alter table public.content_deliverables drop constraint if exists content_deliverables_pkey;
alter table public.content_deliverables add primary key (user_id, id);

alter table public.content_reviews drop constraint if exists content_reviews_pkey;
alter table public.content_reviews add primary key (user_id, id);

alter table public.workflow_tasks drop constraint if exists workflow_tasks_pkey;
alter table public.workflow_tasks add primary key (user_id, id);

