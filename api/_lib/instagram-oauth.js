import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_SECONDS = 10 * 60;

function keyBytes(secret) {
  const value = String(secret || '');
  if (!value) throw Object.assign(new Error('缺少伺服器環境設定：INSTAGRAM_OAUTH_STATE_SECRET 或 INSTAGRAM_OAUTH_ENCRYPTION_KEY'), { code: 'INSTAGRAM_OAUTH_NOT_CONFIGURED', status: 503 });
  // Derive a stable 32-byte key so deployment secrets may be entered as a
  // normal random string rather than requiring a particular encoding.
  return createHash('sha256').update(value, 'utf8').digest();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

export function createOAuthState({ userId, secret, ttlSeconds = STATE_TTL_SECONDS, now = Date.now() } = {}) {
  if (!userId) throw Object.assign(new Error('OAuth state 缺少使用者'), { code: 'INSTAGRAM_OAUTH_STATE_INVALID', status: 400 });
  const payload = { userId: String(userId), nonce: randomBytes(16).toString('hex'), exp: Math.floor(now / 1000) + Math.max(60, Number(ttlSeconds) || STATE_TTL_SECONDS) };
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', keyBytes(secret)).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state, secret, now = Date.now()) {
  const [encoded, signature] = String(state || '').split('.');
  if (!encoded || !signature) throw Object.assign(new Error('OAuth state 無效或已過期'), { code: 'INSTAGRAM_OAUTH_STATE_INVALID', status: 400 });
  const expected = createHmac('sha256', keyBytes(secret)).update(encoded).digest();
  const actual = fromBase64url(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error('OAuth state 簽章驗證失敗'), { code: 'INSTAGRAM_OAUTH_STATE_INVALID', status: 400 });
  }
  let payload;
  try { payload = JSON.parse(fromBase64url(encoded).toString('utf8')); } catch {
    throw Object.assign(new Error('OAuth state 內容無效'), { code: 'INSTAGRAM_OAUTH_STATE_INVALID', status: 400 });
  }
  if (!payload?.userId || !payload?.nonce || Number(payload.exp) < Math.floor(now / 1000)) {
    throw Object.assign(new Error('OAuth state 無效或已過期'), { code: 'INSTAGRAM_OAUTH_STATE_INVALID', status: 400 });
  }
  return payload;
}

export function encryptAccessToken(token, secret) {
  const value = String(token || '');
  if (!value) throw Object.assign(new Error('Instagram access token 為空'), { code: 'INSTAGRAM_TOKEN_INVALID', status: 400 });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${base64url(iv)}.${base64url(cipher.getAuthTag())}.${base64url(encrypted)}`;
}

export function decryptAccessToken(ciphertext, secret) {
  const [version, ivEncoded, tagEncoded, dataEncoded] = String(ciphertext || '').split('.');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !dataEncoded) {
    throw Object.assign(new Error('Instagram access token 加密資料無效'), { code: 'INSTAGRAM_TOKEN_INVALID', status: 500 });
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(secret), fromBase64url(ivEncoded));
    decipher.setAuthTag(fromBase64url(tagEncoded));
    return Buffer.concat([decipher.update(fromBase64url(dataEncoded)), decipher.final()]).toString('utf8');
  } catch {
    throw Object.assign(new Error('Instagram access token 解密失敗'), { code: 'INSTAGRAM_TOKEN_INVALID', status: 500 });
  }
}

export function oauthSecret(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw Object.assign(new Error(`缺少伺服器環境設定：${name}`), { code: 'INSTAGRAM_OAUTH_NOT_CONFIGURED', status: 503 });
  return value;
}

