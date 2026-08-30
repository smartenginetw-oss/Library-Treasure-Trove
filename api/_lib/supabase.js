import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少伺服器環境設定：${name}`);
  return value;
}

export function createUserClient(accessToken) {
  const url = required('SUPABASE_URL');
  const key = required('SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

export function createServiceClient() {
  const url = required('SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Object.assign(new Error('缺少伺服器環境設定：SUPABASE_SERVICE_ROLE_KEY'), { code: 'SUPABASE_NOT_CONFIGURED', status: 503 });
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function isAdminUser(user) {
  return user?.app_metadata?.role === 'admin';
}

export async function authenticateRequest(req) {
  const token = req.headers?.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    const error = new Error('需要登入後才能使用此服務');
    error.code = 'AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }
  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error('登入狀態已失效，請重新登入');
    authError.code = 'AUTH_INVALID';
    authError.status = 401;
    throw authError;
  }
  return { client, user: data.user, token };
}

export function envStatus() {
  return {
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID),
    instagramOAuth: Boolean(
      (process.env.INSTAGRAM_META_APP_ID || process.env.INSTAGRAM_OAUTH_CLIENT_ID) &&
      (process.env.INSTAGRAM_META_APP_SECRET || process.env.INSTAGRAM_OAUTH_CLIENT_SECRET) &&
      process.env.INSTAGRAM_OAUTH_STATE_SECRET &&
      process.env.INSTAGRAM_OAUTH_ENCRYPTION_KEY
    ),
    cron: Boolean(process.env.CRON_SECRET)
  };
}
