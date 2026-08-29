export function setJsonHeaders(res, req) {
  const origin = req?.headers?.origin;
  const allowedOrigin = String(process.env.APP_ORIGIN || '').trim();
  // 未設定允許來源時不回傳 ACAO；同源請求不需要 CORS，跨來源請求則應明確設定 APP_ORIGIN。
  if (origin && allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

export function json(res, status, payload) {
  res.status(status).json(payload);
}

export function methodNotAllowed(res, methods = ['POST']) {
  res.setHeader('Allow', methods.join(', '));
  return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
}

export function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw Object.assign(new Error('請提供有效的 JSON 內容'), { code: 'INVALID_JSON', status: 400 });
    }
  }
  return {};
}

export function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || '';
}

export function stringValue(value, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function stringArray(value, maxItems = 30, maxLength = 500) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
