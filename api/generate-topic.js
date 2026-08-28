import { authenticateRequest } from './_lib/supabase.js';
import { json, methodNotAllowed, readJson, setJsonHeaders, stringArray, stringValue } from './_lib/http.js';

const topicSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'targetAudience', 'contentTheme', 'trafficCodes', 'hook', 'hookType', 'whyItWorks', 'contentStructure', 'cta', 'seriesIdeas', 'differentiation', 'copyingRisk', 'viralPotential', 'angle'],
  properties: {
    title: { type: 'string' },
    targetAudience: { type: 'string' },
    contentTheme: { type: 'string' },
    trafficCodes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    hook: { type: 'string' },
    hookType: { type: 'string' },
    whyItWorks: { type: 'string' },
    contentStructure: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 },
    cta: { type: 'string' },
    seriesIdeas: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    differentiation: { type: 'string' },
    copyingRisk: { type: 'string' },
    viralPotential: { type: 'integer', minimum: 0, maximum: 100 },
    angle: { type: 'string' }
  }
};
const allowedAngles = new Set(['錯誤', '步驟', '案例', '觀點', '清單']);

function errorResponse(res, error) {
  const status = error.status || 500;
  return json(res, status, { error: error.code || 'SERVER_ERROR', message: error.message || '伺服器發生錯誤' });
}

function topicInput(body) {
  const source = body.sourceViralContent && typeof body.sourceViralContent === 'object' ? body.sourceViralContent : {};
  return {
    creator: body.creator && typeof body.creator === 'object' ? body.creator : {},
    sourceViralContent: {
      id: stringValue(source.id, 120),
      title: stringValue(source.title, 300),
      summary: stringValue(source.summary, 2500),
      contentTheme: stringValue(source.contentTheme, 100),
      trafficCodes: stringArray(source.trafficCodes, 5, 100),
      hookType: stringValue(source.hookType, 100),
      format: stringValue(source.format, 100)
    },
    theme: stringValue(body.theme, 100),
    trafficCode: stringValue(body.trafficCode, 100),
    hookType: stringValue(body.hookType, 100),
    format: stringValue(body.format, 100),
    differentiation: stringValue(body.differentiation, 1200),
    seriesPotential: stringValue(body.seriesPotential, 500),
    angle: stringValue(body.angle, 100)
  };
}

function validateOutput(value, sourceTitle) {
  if (!value || typeof value !== 'object') throw Object.assign(new Error('智慧服務回傳格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  const required = ['title', 'targetAudience', 'contentTheme', 'trafficCodes', 'hook', 'hookType', 'whyItWorks', 'contentStructure', 'cta', 'seriesIdeas', 'differentiation', 'copyingRisk', 'viralPotential', 'angle'];
  if (required.some(key => value[key] === undefined || value[key] === null)) throw Object.assign(new Error('智慧服務缺少必要欄位'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  const stringFields = ['title', 'targetAudience', 'contentTheme', 'hook', 'hookType', 'whyItWorks', 'cta', 'differentiation', 'copyingRisk', 'angle'];
  if (stringFields.some(key => typeof value[key] !== 'string')) throw Object.assign(new Error('智慧服務的文字欄位格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (sourceTitle && value.title.trim() === sourceTitle.trim()) throw Object.assign(new Error('產生結果不可直接複製來源標題'), { code: 'AI_COPYING_GUARD', status: 422 });
  if (!Array.isArray(value.contentStructure) || value.contentStructure.length < 3 || !Array.isArray(value.seriesIdeas) || value.seriesIdeas.length < 3) throw Object.assign(new Error('產生結果的結構或系列延伸不足'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (!allowedAngles.has(String(value.angle).trim())) throw Object.assign(new Error('產生結果的內容切角不在允許清單'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  return {
    ...value,
    title: value.title.trim().slice(0, 300),
    targetAudience: value.targetAudience.trim().slice(0, 500),
    contentTheme: value.contentTheme.trim().slice(0, 100),
    trafficCodes: value.trafficCodes.filter(x => typeof x === 'string').slice(0, 3),
    hook: value.hook.trim().slice(0, 1200),
    hookType: value.hookType.trim().slice(0, 100),
    whyItWorks: value.whyItWorks.trim().slice(0, 1600),
    contentStructure: value.contentStructure.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 500)).slice(0, 8),
    cta: value.cta.trim().slice(0, 500),
    seriesIdeas: value.seriesIdeas.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 300)).slice(0, 6),
    differentiation: value.differentiation.trim().slice(0, 1200),
    copyingRisk: value.copyingRisk.trim().slice(0, 800),
    viralPotential: Math.max(0, Math.min(100, Math.round(Number(value.viralPotential) || 0))),
    angle: value.angle.trim().slice(0, 100)
  };
}

function topicRow(topic, userId, sourceId) {
  return {
    id: `ai_${crypto.randomUUID()}`,
    user_id: userId,
    title: topic.title,
    target_audience: topic.targetAudience,
    content_theme: topic.contentTheme,
    traffic_codes: topic.trafficCodes,
    hook: topic.hook,
    hook_type: topic.hookType,
    why_it_works: topic.whyItWorks,
    content_structure: topic.contentStructure,
    cta: topic.cta,
    series_ideas: topic.seriesIdeas,
    differentiation: topic.differentiation,
    copying_risk: topic.copyingRisk,
    viral_potential: topic.viralPotential,
    status: 'IDEA',
    source_viral_content_id: sourceId || null,
    content_category: '',
    angle: topic.angle,
    payload: topic
  };
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { client, user } = await authenticateRequest(req);
    if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('尚未設定伺服器端智慧服務金鑰'), { code: 'AI_NOT_CONFIGURED', status: 503 });
    const input = topicInput(readJson(req));
    const prompt = [
      '你是「藏書閣寶典」的內容策略顧問。請以繁體中文產生一個原創選題。',
      '只能借鑑來源案例的內容結構、受眾心理與流量機制，不得複製來源標題、句子、人物、故事或具體情節。',
      '結果必須嚴格符合提供的 JSON Schema，不要輸出 Markdown 或額外文字。',
      `創作者設定：${JSON.stringify(input.creator)}`,
      `來源案例（僅供抽象拆解）：${JSON.stringify(input.sourceViralContent)}`,
      `本次指定：${JSON.stringify({ theme: input.theme, trafficCode: input.trafficCode, hookType: input.hookType, format: input.format, differentiation: input.differentiation, seriesPotential: input.seriesPotential, angle: input.angle })}`,
      '內容切角只能是錯誤、步驟、案例、觀點、清單之一；若指定資料不足，請在 differentiation 說明需要補上的真實案例，不要自行編造。'
    ].join('\n');
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        messages: [{ role: 'system', content: '你是一個嚴謹、重視原創邊界的內容策略顧問。' }, { role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'content_topic', strict: true, schema: topicSchema } }
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('OpenAI upstream error', upstream.status, detail.slice(0, 1000));
      throw Object.assign(new Error('智慧服務暫時無法回應，請稍後再試'), { code: 'AI_UPSTREAM_ERROR', status: 502 });
    }
    const completion = await upstream.json();
    const raw = completion.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('智慧服務回傳的結構化格式無法解析'), { code: 'AI_INVALID_OUTPUT', status: 502 });
    }
    const output = validateOutput(parsed, input.sourceViralContent.title);
    const row = topicRow(output, user.id, input.sourceViralContent.id);
    const { error: saveError } = await client.from('topics').upsert(row);
    if (saveError) {
      console.error('topic persistence error', saveError);
      throw Object.assign(new Error('選題已產生，但儲存到雲端失敗'), { code: 'TOPIC_SAVE_ERROR', status: 502 });
    }
    return json(res, 200, { topic: { ...output, id: row.id, status: row.status, sourceViralContentId: row.source_viral_content_id, createdAt: row.created_at || new Date().toISOString() }, persisted: true });
  } catch (error) {
    return errorResponse(res, error);
  }
}
