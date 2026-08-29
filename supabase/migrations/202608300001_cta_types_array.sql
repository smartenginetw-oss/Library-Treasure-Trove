-- 內容交付包 CTA 從單值升級為有順序的陣列。
-- 第一個元素是主要 CTA；最多保存三個 CTA；「無直接 CTA」必須單獨使用。

alter table public.content_deliverables
  add column if not exists cta_types text[] not null default '{}';

update public.content_deliverables
set cta_types = array(
  select value
  from jsonb_array_elements_text(payload -> 'ctaTypes') with ordinality as items(value, position)
  where value = any (array['留言','收藏','私訊','連結','購買','到店','分享','轉發','無直接 CTA']::text[])
  order by position
  limit 3
)
where cardinality(cta_types) = 0
  and jsonb_typeof(payload -> 'ctaTypes') = 'array';

update public.content_deliverables
set cta_types = array[payload ->> 'ctaType']
where cardinality(cta_types) = 0
  and jsonb_typeof(payload -> 'ctaType') = 'string'
  and (payload ->> 'ctaType') = any (array['留言','收藏','私訊','連結','購買','到店','分享','轉發','無直接 CTA']::text[]);

update public.content_deliverables
set payload = jsonb_set(payload, '{ctaTypes}', to_jsonb(cta_types), true) - 'ctaType'
where payload ? 'ctaType' or payload ? 'ctaTypes';

alter table public.content_deliverables
  drop constraint if exists content_deliverables_cta_types_check;

alter table public.content_deliverables
  add constraint content_deliverables_cta_types_check
  check (
    cardinality(cta_types) <= 3
    and cta_types <@ array['留言','收藏','私訊','連結','購買','到店','分享','轉發','無直接 CTA']::text[]
    and ('無直接 CTA' <> all (cta_types) or cardinality(cta_types) = 1)
  );
