import { authenticateRequest } from './_lib/supabase.js';
import { json, methodNotAllowed, readJson, setJsonHeaders, stringArray, stringValue } from './_lib/http.js';

function viralRow(body, userId) {
  const number = key => Number.isFinite(Number(body[key])) ? Math.max(0, Math.round(Number(body[key]))) : null;
  return {
    id: stringValue(body.id, 120) || `v_${crypto.randomUUID()}`,
    title: stringValue(body.title, 300),
    creator_name: stringValue(body.creatorName, 160),
    creator_handle: stringValue(body.creatorHandle, 160),
    platform: stringValue(body.platform, 80),
    niche: stringValue(body.niche, 120),
    followers: number('followers'),
    views: number('views'),
    likes: number('likes'),
    comments: number('comments'),
    velocity: Number.isFinite(Number(body.velocity)) ? Number(body.velocity) : 60,
    freshness: Number.isFinite(Number(body.freshness)) ? Number(body.freshness) : 70,
    repeated_format: Number.isFinite(Number(body.repeatedFormat)) ? Number(body.repeatedFormat) : 60,
    traffic_codes: stringArray(body.trafficCodes || body.code ? (body.trafficCodes || [body.code]) : [], 5, 100),
    hook_type: stringValue(body.hookType, 100),
    cover_type: stringValue(body.coverType, 100),
    format: stringValue(body.format, 100),
    summary: stringValue(body.summary, 3000),
    comments_sample: stringValue(body.commentsSample || body.summary, 5000),
    source_url: stringValue(body.sourceUrl, 1000),
    archived: Boolean(body.archived),
    created_by: userId
  };
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { client, user } = await authenticateRequest(req);
    const body = readJson(req);
    const action = stringValue(body.action, 20) || 'upsert';
    if (action === 'archive') {
      const id = stringValue(body.id, 120);
      if (!id) return json(res, 400, { error: 'VIRAL_ID_REQUIRED', message: '缺少案例編號' });
      const result = await client.from('viral_contents').update({ archived: Boolean(body.archived) }).eq('id', id).select('*').single();
      if (result.error) throw Object.assign(new Error('案例狀態更新失敗，請確認管理員權限'), { code: 'VIRAL_UPDATE_ERROR', status: 403 });
      return json(res, 200, { viral: result.data });
    }
    const row = viralRow(body, user.id);
    if (!row.title || !row.creator_name) return json(res, 400, { error: 'VIRAL_FIELDS_REQUIRED', message: '標題與創作者名稱不可空白' });
    if (!row.followers || !row.views) return json(res, 400, { error: 'VIRAL_METRICS_REQUIRED', message: '粉絲數與觀看數不可空白，避免產生誤導分數' });
    const result = await client.from('viral_contents').upsert(row).select('*').single();
    if (result.error) throw Object.assign(new Error('案例收錄失敗，請確認管理員權限與資料格式'), { code: 'VIRAL_INSERT_ERROR', status: 403 });
    return json(res, 200, { viral: result.data });
  } catch (error) {
    return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || '案例服務失敗' });
  }
}
