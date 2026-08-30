import { authenticateRequest } from './_lib/supabase.js';
import { json, methodNotAllowed, readJson, setJsonHeaders } from './_lib/http.js';
import { MANUAL_IMPORT_FIELDS, manualImportRow } from './_lib/manual-import.js';

function safeError(error) {
  return { error: error.code || 'MANUAL_IMPORT_ERROR', message: error.message || '手動匯入失敗' };
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'DELETE', 'OPTIONS']);
  try {
    const { client, user } = await authenticateRequest(req);
    if (req.method === 'GET') {
      const result = await client.from('manual_content_imports').select(MANUAL_IMPORT_FIELDS).order('created_at', { ascending: false });
      if (result.error) throw Object.assign(new Error('手動匯入讀取失敗'), { code: 'MANUAL_IMPORT_READ_ERROR', status: 502 });
      return json(res, 200, { imports: result.data || [] });
    }
    if (req.method === 'DELETE') {
      const id = String(req.query?.id || new URL(req.url || '/', 'http://localhost').searchParams.get('id') || '').trim();
      if (!id) return json(res, 422, { error: 'IMPORT_ID_REQUIRED', message: '缺少要刪除的匯入項目' });
      const result = await client.from('manual_content_imports').delete().eq('id', id).eq('user_id', user.id).select('id').maybeSingle();
      if (result.error) throw Object.assign(new Error('手動匯入刪除失敗'), { code: 'MANUAL_IMPORT_DELETE_ERROR', status: 502 });
      return json(res, 200, { deleted: Boolean(result.data?.id) });
    }
    const input = readJson(req);
    if (input.action === 'delete') {
      const result = await client.from('manual_content_imports').delete().eq('id', String(input.id || '')).eq('user_id', user.id).select('id').maybeSingle();
      if (result.error) throw Object.assign(new Error('手動匯入刪除失敗'), { code: 'MANUAL_IMPORT_DELETE_ERROR', status: 502 });
      return json(res, 200, { deleted: Boolean(result.data?.id) });
    }
    const row = manualImportRow(input, user.id);
    // Do not allow the browser to set ownership or server-managed sync fields.
    const result = await client.from('manual_content_imports')
      .upsert(row, { onConflict: 'user_id,source_url' })
      .select(MANUAL_IMPORT_FIELDS)
      .single();
    if (result.error) throw Object.assign(new Error('手動匯入寫入失敗'), { code: 'MANUAL_IMPORT_WRITE_ERROR', status: 502 });
    return json(res, 200, { import: result.data });
  } catch (error) {
    return json(res, error.status || 500, safeError(error));
  }
}

