-- 基礎安全回歸測試（需要 Supabase CLI 的 supabase test db / pgTAP 環境）。
-- 它先確認所有 exposed public tables 都存在且已啟用 RLS；實際 owner allow/deny
-- 測試需在測試資料庫建立兩個 auth.users fixture 後，再以 request.jwt.claim.sub
-- 切換兩個使用者執行 select/insert/update/delete。
begin;
select plan(14);

select has_table('public', 'creator_profiles', 'creator_profiles table exists');
select has_table('public', 'viral_contents', 'viral_contents table exists');
select has_table('public', 'topics', 'topics table exists');
select has_table('public', 'formulas', 'formulas table exists');
select has_table('public', 'viral_analyses', 'viral_analyses table exists');
select has_table('public', 'saved_viral_contents', 'saved_viral_contents table exists');

select is((select relrowsecurity from pg_class where oid = 'public.creator_profiles'::regclass), true, 'creator_profiles has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.viral_contents'::regclass), true, 'viral_contents has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.topics'::regclass), true, 'topics has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.formulas'::regclass), true, 'formulas has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.viral_analyses'::regclass), true, 'viral_analyses has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.saved_viral_contents'::regclass), true, 'saved_viral_contents has RLS');

select ok((select count(*) >= 4 from pg_policies where schemaname = 'public' and tablename = 'topics'), 'topics has CRUD policies');
select ok((select count(*) >= 4 from pg_policies where schemaname = 'public' and tablename = 'creator_profiles'), 'creator_profiles has CRUD policies');

select * from finish();
rollback;
