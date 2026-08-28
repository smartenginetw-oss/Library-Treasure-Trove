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
    openai: Boolean(process.env.OPENAI_API_KEY)
  };
}
