import process from 'node:process';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
};

let config;

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function appRequest(path, token, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
  return readResponse(await fetch(`${config.baseUrl}${path}`, { ...options, headers }));
}

async function supabaseRequest(path, token, options = {}) {
  const headers = { apikey: config.anonKey, Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  return readResponse(await fetch(`${config.supabaseUrl}${path}`, { ...options, headers }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getUser(token, label) {
  const { response, payload } = await supabaseRequest('/auth/v1/user', token);
  assert(response.ok && payload.id, `${label} 測試帳號 token 無效`);
  return payload;
}

async function main() {
  config = {
    baseUrl: required('E2E_BASE_URL').replace(/\/$/, ''),
    supabaseUrl: required('SUPABASE_URL').replace(/\/$/, ''),
    anonKey: required('SUPABASE_ANON_KEY'),
    tokenA: required('E2E_ACCESS_TOKEN_A'),
    tokenB: required('E2E_ACCESS_TOKEN_B')
  };
  const health = await appRequest('/api/health');
  assert(health.response.ok && health.payload.configured?.supabase, '線上 Supabase 尚未配置');
  assert(health.payload.configured?.openai, '線上 OpenAI 尚未配置');

  for (const path of ['/api/generate-topic', '/api/sync-state', '/api/admin-viral']) {
    const result = await appRequest(path, '', { method: 'POST', body: '{}' });
    assert(result.response.status === 401 && result.payload.error === 'AUTH_REQUIRED', `${path} 未登入驗證失敗`);
  }

  const [userA, userB] = await Promise.all([getUser(config.tokenA, 'A'), getUser(config.tokenB, 'B')]);
  assert(userA.id !== userB.id, '兩個 E2E token 指向同一個帳號');

  const generated = await appRequest('/api/generate-topic', config.tokenA, {
    method: 'POST',
    body: JSON.stringify({
      creator: { name: 'E2E 測試創作者', primaryNiche: 'Creator', audienceIdentity: '需要穩定產出的測試創作者', audienceProblem: '不知道如何判斷題目' },
      sourceViralContent: { title: 'E2E 來源案例，不可複製', summary: '只用於驗證結構化原創轉化。', contentTheme: '教知識', trafficCodes: ['受眾'], hookType: '問題直擊', format: '口播＋畫面切換' },
      theme: '教知識', trafficCode: '受眾', hookType: '問題直擊', format: '口播＋畫面切換',
      differentiation: '使用專用測試帳號的虛構案例，不代表真實內容。', seriesPotential: '可延伸三集以上', angle: '錯誤'
    })
  });
  assert(generated.response.ok && generated.payload.persisted && generated.payload.topic?.id, `AI 生成失敗：${generated.payload.message || generated.response.status}`);
  const topicId = encodeURIComponent(generated.payload.topic.id);

  const ownRead = await supabaseRequest(`/rest/v1/topics?select=id,user_id&id=eq.${topicId}`, config.tokenA);
  assert(ownRead.response.ok && ownRead.payload.length === 1 && ownRead.payload[0].user_id === userA.id, '帳號 A 無法讀取自己的選題');
  const crossRead = await supabaseRequest(`/rest/v1/topics?select=id,user_id&id=eq.${topicId}`, config.tokenB);
  assert(crossRead.response.ok && crossRead.payload.length === 0, '帳號 B 可以讀取帳號 A 的選題');

  // 這是專用測試帳號才可執行的清理，同時驗證同步刪除流程。
  const cleared = await appRequest('/api/sync-state', config.tokenA, { method: 'POST', body: JSON.stringify({ profile: {}, topics: [] }) });
  assert(cleared.response.ok, `同步清理失敗：${cleared.payload.message || cleared.response.status}`);
  const afterClear = await supabaseRequest(`/rest/v1/topics?select=id&id=eq.${topicId}`, config.tokenA);
  assert(afterClear.response.ok && afterClear.payload.length === 0, '同步刪除後選題仍存在');

  console.log(JSON.stringify({ ok: true, checks: ['health', 'unauthenticated-401', 'account-isolation', 'openai-generate-and-persist', 'sync-delete'], users: [userA.id.slice(0, 8), userB.id.slice(0, 8)] }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
