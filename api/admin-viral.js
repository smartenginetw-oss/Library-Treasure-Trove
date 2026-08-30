import { authenticateRequest } from './_lib/supabase.js';
import { json, methodNotAllowed, readJson, setJsonHeaders, stringArray, stringValue } from './_lib/http.js';
import { createHash } from 'node:crypto';

const MAX_BATCH_ROWS = 100;

function generatedViralId(body) {
  const sourceUrl = stringValue(body.sourceUrl, 1000);
  if (sourceUrl) return `v_${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32)}`;
  return `v_${crypto.randomUUID()}`;
}

export function viralRow(body, userId) {
  const number = key => Number.isFinite(Number(body[key])) ? Math.max(0, Math.round(Number(body[key]))) : null;
  const durationSeconds = Number.isFinite(Number(body.durationSeconds)) ? Math.max(0, Math.min(86400, Math.round(Number(body.durationSeconds)))) : null;
  const score = (key, fallback) => Number.isFinite(Number(body[key])) ? Math.max(0, Math.min(100, Number(body[key]))) : fallback;
  return {
    id: stringValue(body.id, 120) || generatedViralId(body),
    title: stringValue(body.title, 300),
    creator_name: stringValue(body.creatorName, 160),
    creator_handle: stringValue(body.creatorHandle, 160),
    platform: stringValue(body.platform, 80),
    niche: stringValue(body.niche, 120),
    followers: number('followers'),
    views: number('views'),
    likes: number('likes'),
    comments: number('comments'),
    duration_seconds: durationSeconds,
    reposts: number('reposts'),
    shares: number('shares'),
    velocity: score('velocity', 60),
    freshness: score('freshness', 70),
    repeated_format: score('repeatedFormat', 60),
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

export function viralBatchRows(rows, userId) {
  if (!Array.isArray(rows)) return { rows: [], errors: [{ row: 0, message: 'rows 必須是陣列' }] };
  if (!rows.length) return { rows: [], errors: [{ row: 0, message: '至少要有一筆案例' }] };
  if (rows.length > MAX_BATCH_ROWS) return { rows: [], errors: [{ row: 0, message: `單次最多匯入 ${MAX_BATCH_ROWS} 筆案例` }] };

  const normalized = [];
  const errors = [];
  const ids = new Set();
  rows.forEach((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      errors.push({ row: index + 1, message: '案例資料必須是物件' });
      return;
    }
    const row = viralRow(input, userId);
    const rowErrors = [];
    if (!row.title) rowErrors.push('標題不可空白');
    if (!row.creator_name) rowErrors.push('創作者名稱不可空白');
    if (!row.followers || !row.views) rowErrors.push('粉絲數與觀看數不可空白');
    if (ids.has(row.id)) rowErrors.push('案例編號重複；請移除重複 id 或 sourceUrl');
    if (rowErrors.length) errors.push({ row: index + 1, message: rowErrors.join('；') });
    ids.add(row.id);
    normalized.push(row);
  });
  return { rows: normalized, errors };
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { client, user } = await authenticateRequest(req);
    const body = readJson(req);
    const action = stringValue(body.action, 20) || 'upsert';
    if (action === 'batch-upsert') {
      const batch = viralBatchRows(body.rows, user.id);
      if (batch.errors.length) {
        return json(res, 422, {
          error: 'VIRAL_BATCH_INVALID',
          message: `批次資料有 ${batch.errors.length} 筆需要修正`,
          rowErrors: batch.errors
        });
      }
      const result = await client.from('viral_contents').upsert(batch.rows, { onConflict: 'id' }).select('id');
      if (result.error) throw Object.assign(new Error('批次案例匯入失敗，請確認管理員權限與資料格式'), { code: 'VIRAL_BATCH_INSERT_ERROR', status: 403 });
      return json(res, 200, { imported: result.data?.length || 0, ids: (result.data || []).map(row => row.id) });
    }
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
