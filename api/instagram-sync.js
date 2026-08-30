import { authenticateRequest, isAdminUser } from './_lib/supabase.js';
import { syncInstagramCreators } from './_lib/instagram-sync.js';
import { json, methodNotAllowed, setJsonHeaders } from './_lib/http.js';

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { user } = await authenticateRequest(req);
    if (!isAdminUser(user)) return json(res, 403, { error: 'ADMIN_REQUIRED', message: '只有管理員可以執行 Instagram 同步' });
    const result = await syncInstagramCreators({ trigger: 'manual' });
    return json(res, result.ok ? 200 : 207, result);
  } catch (error) {
    return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || 'Instagram 同步失敗' });
  }
}
