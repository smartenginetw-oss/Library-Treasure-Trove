-- 保留短影音研究需要的影片長度與分享／轉發指標。
alter table public.viral_contents
  add column if not exists duration_seconds integer,
  add column if not exists reposts bigint,
  add column if not exists shares bigint;

alter table public.viral_contents
  drop constraint if exists viral_contents_duration_seconds_check,
  drop constraint if exists viral_contents_reposts_check,
  drop constraint if exists viral_contents_shares_check;

alter table public.viral_contents
  add constraint viral_contents_duration_seconds_check check (duration_seconds is null or duration_seconds between 0 and 86400),
  add constraint viral_contents_reposts_check check (reposts is null or reposts >= 0),
  add constraint viral_contents_shares_check check (shares is null or shares >= 0);
