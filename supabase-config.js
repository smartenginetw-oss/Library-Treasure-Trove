/*
 * 本檔案只放 Supabase 前端公開設定。publishable/anon key 可以出現在瀏覽器，
 * 但 service_role key、OpenAI key 絕對不能放在這裡。
 * 部署前請複製 supabase-config.example.js，填入 Supabase URL 與 publishable/anon key。
 */
window.SUPABASE_CONFIG = Object.freeze({
  url: '',
  anonKey: '',
  apiBase: ''
});
