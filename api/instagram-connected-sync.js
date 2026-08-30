import { authenticateRequest } from './_lib/supabase.js';
import { syncInstagramConnections } from './_lib/instagram-connected-sync.js';
import { json, methodNotAllowed, setJsonHeaders } from './_lib/http.js';

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);
  try {
    const { user } = await authenticateRequest(req);
    const result = await syncInstagramConnections({ userId: user.id, trigger: 'manual' });
    return json(res, result.ok ? 200 : 207, result);
  } catch (error) {
    return json(res, error.status || 500, { error: error.code || 'INSTAGRAM_SYNC_ERROR', message: error.message || 'Instagram 授權同步失敗' });
  }
}

