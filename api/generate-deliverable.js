import { authenticateRequest } from './_lib/supabase.js';
import { deliverableRow } from './_lib/deliverable.js';
import { buildPrompt, deliverableInput, deliverableSchema, validateOutput } from './_lib/generate-deliverable.js';
import { json, methodNotAllowed, readJson, setJsonHeaders } from './_lib/http.js';

function errorResponse(res, error) {
  return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || '伺服器發生錯誤' });
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { client, user } = await authenticateRequest(req);
    if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('尚未設定伺服器端智慧服務金鑰'), { code: 'AI_NOT_CONFIGURED', status: 503 });
    const input = deliverableInput(readJson(req));
    if (!input.topic.title) throw Object.assign(new Error('請先選擇一個有效的智慧選題'), { code: 'TOPIC_REQUIRED', status: 400 });
    if (!input.coreMessage) input.coreMessage = input.topic.differentiation || input.topic.hook || input.topic.title;
    if (!input.caseText) input.caseText = input.profile.experienceStories[0] || '請補上你的真實案例、對話、數字或前後差異。';
    if (!input.angle) input.angle = input.topic.angle || '步驟';
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        messages: [{ role: 'system', content: '你是一個重視原創、證據邊界與可拍攝性的繁體中文內容總編。' }, { role: 'user', content: buildPrompt(input) }],
        response_format: { type: 'json_schema', json_schema: { name: 'content_deliverable', strict: true, schema: deliverableSchema } }
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('OpenAI deliverable upstream error', upstream.status, detail.slice(0, 1000));
      throw Object.assign(new Error('智慧文案服務暫時無法回應，請稍後再試'), { code: 'AI_UPSTREAM_ERROR', status: 502 });
    }
    const completion = await upstream.json();
    const raw = completion.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('智慧文案服務回傳格式無法解析'), { code: 'AI_INVALID_OUTPUT', status: 502 });
    }
    const output = validateOutput(parsed, input.ctaTypes);
    const deliverable = {
      ...output,
      id: `ai_${crypto.randomUUID()}`,
      topicId: input.topic.id || null,
      title: output.title || input.topic.title,
      angle: output.angle || input.angle,
      generationSource: 'openai',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const row = deliverableRow(deliverable, user.id);
    const { data: saved, error: saveError } = await client.from('content_deliverables').upsert(row).select('*').single();
    if (saveError) {
      console.error('deliverable persistence error', saveError);
      throw Object.assign(new Error('AI 文案已產生，但儲存到雲端失敗'), { code: 'DELIVERABLE_SAVE_ERROR', status: 502 });
    }
    return json(res, 200, {
      deliverable: { ...deliverable, id: row.id, ctaTypes: row.cta_types, createdAt: saved?.created_at || deliverable.createdAt, updatedAt: saved?.updated_at || deliverable.updatedAt },
      persisted: true
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}
