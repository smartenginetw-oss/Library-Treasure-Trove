import { syncInstagramCreators } from '../_lib/instagram-sync.js';
import { json, setJsonHeaders } from '../_lib/http.js';

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(res, 401, { error: 'CRON_UNAUTHORIZED', message: '排程驗證失敗' });
  }
  try {
    const result = await syncInstagramCreators({ trigger: 'cron' });
    return json(res, 200, result);
  } catch (error) {
    console.error('Instagram cron sync failed', error);
    return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || 'Instagram 排程同步失敗' });
  }
}
