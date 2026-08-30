import { authenticateRequest, createServiceClient } from './_lib/supabase.js';
import { encryptAccessToken, createOAuthState, oauthSecret, verifyOAuthState } from './_lib/instagram-oauth.js';
import { json, methodNotAllowed, readJson, setJsonHeaders, stringValue } from './_lib/http.js';

const SAFE_FIELDS = 'id,instagram_user_id,username,display_name,token_expires_at,status,last_synced_at,last_error,created_at,updated_at';
const DEFAULT_SCOPES = 'pages_show_list,instagram_basic,instagram_manage_insights,pages_read_engagement';
const DEFAULT_GRAPH_HOST = 'https://graph.facebook.com';

function queryParam(req, name) {
  const fromQuery = req.query?.[name];
  if (Array.isArray(fromQuery)) return String(fromQuery[0] || '');
  if (fromQuery !== undefined) return String(fromQuery || '');
  try { return new URL(req.url || '/', 'http://localhost').searchParams.get(name) || ''; } catch { return ''; }
}

function apiVersion() {
  const raw = String(process.env.INSTAGRAM_API_VERSION || 'v25.0').trim();
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function graphHost() {
  return String(process.env.INSTAGRAM_GRAPH_HOST || DEFAULT_GRAPH_HOST).replace(/\/$/, '');
}

function oauthConfig(req) {
  const clientId = String(process.env.INSTAGRAM_META_APP_ID || process.env.INSTAGRAM_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.INSTAGRAM_META_APP_SECRET || process.env.INSTAGRAM_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw Object.assign(new Error('缺少伺服器環境設定：INSTAGRAM_META_APP_ID、INSTAGRAM_META_APP_SECRET'), { code: 'INSTAGRAM_OAUTH_NOT_CONFIGURED', status: 503 });
  const origin = applicationOrigin(req);
  const redirectUri = String(process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${origin}/api/instagram-auth`).trim();
  if (!/^https:\/\//i.test(redirectUri) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(redirectUri)) {
    throw Object.assign(new Error('Instagram OAuth redirect URI 必須是安全的 HTTPS 網址'), { code: 'INSTAGRAM_OAUTH_REDIRECT_INVALID', status: 503 });
  }
  return { clientId, clientSecret, redirectUri, origin, version: apiVersion(), host: graphHost(), scopes: String(process.env.INSTAGRAM_OAUTH_SCOPES || DEFAULT_SCOPES).split(',').map(s => s.trim()).filter(Boolean) };
}

function applicationOrigin(req) {
  const configured = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  const protocol = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  if (host && (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) || /\.vercel\.app$/i.test(host))) return `${protocol}://${host}`;
  throw Object.assign(new Error('缺少伺服器環境設定：APP_ORIGIN 或 INSTAGRAM_OAUTH_REDIRECT_URI'), { code: 'INSTAGRAM_OAUTH_NOT_CONFIGURED', status: 503 });
}

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  return res.end();
}

function resultRedirect(req, status, message = '') {
  const origin = applicationOrigin(req);
  const params = new URLSearchParams({ instagram: status });
  if (message) params.set('message', String(message).slice(0, 180));
  return `${origin}/#/admin/viral-content?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      const detail = payload.error?.message || `Instagram API 回應 ${response.status}`;
      throw Object.assign(new Error(detail), { code: 'INSTAGRAM_API_ERROR', status: 502 });
    }
    return payload;
  } finally { clearTimeout(timer); }
}

function authUrl(config, state) {
  const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', config.scopes.join(','));
  return url.toString();
}

async function handleCallback(req, res) {
  const code = queryParam(req, 'code');
  const state = queryParam(req, 'state');
  const oauthState = verifyOAuthState(state, oauthSecret('INSTAGRAM_OAUTH_STATE_SECRET'));
  const config = oauthConfig(req);
  const exchangeUrl = new URL(`${config.host}/${config.version}/oauth/access_token`);
  exchangeUrl.searchParams.set('client_id', config.clientId);
  exchangeUrl.searchParams.set('client_secret', config.clientSecret);
  exchangeUrl.searchParams.set('redirect_uri', config.redirectUri);
  exchangeUrl.searchParams.set('code', code);
  const tokenPayload = await fetchJson(exchangeUrl.toString());
  const userToken = String(tokenPayload.access_token || '').trim();
  if (!userToken) throw Object.assign(new Error('Meta 未回傳授權 token'), { code: 'INSTAGRAM_TOKEN_INVALID', status: 502 });
  const accountsUrl = new URL(`${config.host}/${config.version}/me/accounts`);
  accountsUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account');
  accountsUrl.searchParams.set('access_token', userToken);
  const accountsPayload = await fetchJson(accountsUrl.toString());
  const page = (accountsPayload.data || []).find(item => item.instagram_business_account?.id && item.access_token);
  if (!page) throw Object.assign(new Error('此 Meta 帳號沒有可連線的 Instagram 專業帳號；請確認已連結 Facebook 粉絲專頁。'), { code: 'INSTAGRAM_ACCOUNT_NOT_FOUND', status: 422 });
  const pageToken = String(page.access_token).trim();
  const instagramUserId = String(page.instagram_business_account.id).trim();
  const profileUrl = new URL(`${config.host}/${config.version}/${encodeURIComponent(instagramUserId)}`);
  profileUrl.searchParams.set('fields', 'id,username,name');
  profileUrl.searchParams.set('access_token', pageToken);
  const profile = await fetchJson(profileUrl.toString());
  const username = String(profile.username || '').trim();
  if (!username) throw Object.assign(new Error('Meta 未回傳 Instagram 使用者名稱'), { code: 'INSTAGRAM_ACCOUNT_NOT_FOUND', status: 422 });
  const service = createServiceClient();
  const stored = await service.from('instagram_creator_connections').upsert({
    user_id: oauthState.userId,
    instagram_user_id: instagramUserId,
    username: username.slice(0, 30),
    display_name: String(profile.name || page.name || username).slice(0, 160),
    access_token_ciphertext: encryptAccessToken(pageToken, oauthSecret('INSTAGRAM_OAUTH_ENCRYPTION_KEY')),
    token_expires_at: tokenPayload.expires_in ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString() : null,
    status: 'CONNECTED',
    last_error: ''
  }, { onConflict: 'user_id,instagram_user_id' }).select(SAFE_FIELDS).single();
  if (stored.error) throw Object.assign(new Error('Instagram 連線資料寫入失敗'), { code: 'INSTAGRAM_CONNECTION_WRITE_ERROR', status: 502 });
  return redirect(res, resultRedirect(req, 'connected'));
}

async function listConnections(req, res) {
  const { client } = await authenticateRequest(req);
  const result = await client.from('instagram_creator_connections').select(SAFE_FIELDS).order('updated_at', { ascending: false });
  if (result.error) throw Object.assign(new Error('Instagram 授權連線讀取失敗'), { code: 'INSTAGRAM_CONNECTION_READ_ERROR', status: 502 });
  return json(res, 200, { connections: result.data || [] });
}

async function disconnect(req, res) {
  const { client, user } = await authenticateRequest(req);
  const input = readJson(req);
  const id = stringValue(input.id, 100);
  if (!id) return json(res, 422, { error: 'CONNECTION_ID_REQUIRED', message: '缺少要中止的連線' });
  const result = await client.from('instagram_creator_connections').update({ status: 'REVOKED', access_token_ciphertext: 'revoked', last_error: '' }).eq('id', id).eq('user_id', user.id).select(SAFE_FIELDS).maybeSingle();
  if (result.error) throw Object.assign(new Error('Instagram 連線中止失敗'), { code: 'INSTAGRAM_CONNECTION_UPDATE_ERROR', status: 502 });
  return json(res, 200, { connection: result.data || null });
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET' && queryParam(req, 'code')) return await handleCallback(req, res);
    if (req.method === 'GET' && queryParam(req, 'action') === 'start') {
      const { user } = await authenticateRequest(req);
      const config = oauthConfig(req);
      const state = createOAuthState({ userId: user.id, secret: oauthSecret('INSTAGRAM_OAUTH_STATE_SECRET') });
      return json(res, 200, { authorizationUrl: authUrl(config, state) });
    }
    if (req.method === 'GET' && queryParam(req, 'action') === 'connections') return await listConnections(req, res);
    if (req.method === 'POST') {
      const input = readJson(req);
      if (input.action === 'disconnect') return await disconnect(req, res);
      return json(res, 422, { error: 'OAUTH_ACTION_INVALID', message: '不支援的 Instagram 授權操作' });
    }
    return methodNotAllowed(res, ['GET', 'POST', 'OPTIONS']);
  } catch (error) {
    if (req.method === 'GET' && queryParam(req, 'code')) {
      try { return redirect(res, resultRedirect(req, 'error', error.message)); } catch { /* fall through to JSON */ }
    }
    return json(res, error.status || 500, { error: error.code || 'INSTAGRAM_OAUTH_ERROR', message: error.message || 'Instagram 授權失敗' });
  }
}

export { applicationOrigin, authUrl, oauthConfig };

