import { authenticateRequest, isAdminUser } from './_lib/supabase.js';
import { json, methodNotAllowed, readJson, setJsonHeaders, stringValue } from './_lib/http.js';

function normalizeUsername(value) {
  const normalized = stringValue(value, 40).replace(/^@/, '');
  return /^[a-zA-Z0-9._]{1,30}$/.test(normalized) ? normalized : '';
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'OPTIONS']);
  try {
    const { client, user } = await authenticateRequest(req);
    if (req.method === 'GET') {
      const result = await client.from('instagram_monitored_creators').select('*').order('created_at', { ascending: true });
      if (result.error) throw Object.assign(new Error('Instagram 監測來源讀取失敗'), { code: 'INSTAGRAM_SOURCE_READ_ERROR', status: 502 });
      return json(res, 200, { sources: result.data || [] });
    }
    if (!isAdminUser(user)) return json(res, 403, { error: 'ADMIN_REQUIRED', message: '只有管理員可以管理 Instagram 監測來源' });
    const body = readJson(req);
    const action = stringValue(body.action, 20) || 'upsert';
    if (action === 'disable' || action === 'enable') {
      const id = stringValue(body.id, 80);
      if (!id) return json(res, 400, { error: 'SOURCE_ID_REQUIRED', message: '缺少監測來源編號' });
      const result = await client.from('instagram_monitored_creators').update({ enabled: action === 'enable' }).eq('id', id).select('*').single();
      if (result.error) throw Object.assign(new Error('Instagram 監測來源狀態更新失敗'), { code: 'INSTAGRAM_SOURCE_UPDATE_ERROR', status: 502 });
      return json(res, 200, { source: result.data });
    }
    const username = normalizeUsername(body.username);
    if (!username) return json(res, 400, { error: 'INSTAGRAM_USERNAME_INVALID', message: '請輸入有效的 Instagram 帳號名稱' });
    const row = {
      username,
      display_name: stringValue(body.displayName, 160),
      niche: stringValue(body.niche, 120),
      source_url: stringValue(body.sourceUrl, 1000) || `https://www.instagram.com/${username}/`,
      enabled: body.enabled !== false
    };
    const result = await client.from('instagram_monitored_creators').upsert(row, { onConflict: 'username' }).select('*').single();
    if (result.error) throw Object.assign(new Error('Instagram 監測來源儲存失敗'), { code: 'INSTAGRAM_SOURCE_WRITE_ERROR', status: 502 });
    return json(res, 200, { source: result.data });
  } catch (error) {
    return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || 'Instagram 監測來源服務失敗' });
  }
}
