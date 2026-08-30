import { envStatus } from './_lib/supabase.js';
import { json, setJsonHeaders } from './_lib/http.js';

export default function handler(req, res) {
  setJsonHeaders(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  return json(res, 200, {
    ok: true,
    service: '藏書閣寶典伺服器端服務',
    mode: 'cloud-ready',
    configured: envStatus(),
    timestamp: new Date().toISOString()
  });
}
