const MODEL_DEFINITIONS = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', description: '品質優先，適合複雜內容整理' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', description: '品質與成本平衡' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', description: '大量產出與成本優先' },
  { id: 'gpt-5.5', label: 'GPT-5.5', description: '專業內容產出' },
  { id: 'gpt-5.4', label: 'GPT-5.4', description: '穩定推理與內容改寫' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: '速度與成本優先' },
  { id: 'gpt-4o', label: 'GPT-4o', description: '成熟的多模態模型' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: '快速、經濟的預設選項' }
];

export const OPENAI_MODELS = Object.freeze(MODEL_DEFINITIONS.map(model => Object.freeze({ ...model })));
export const OPENAI_MODEL_IDS = Object.freeze(OPENAI_MODELS.map(model => model.id));
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export function configuredOpenAIModel(env = process.env) {
  const candidate = String(env?.OPENAI_MODEL || '').trim();
  return OPENAI_MODEL_IDS.includes(candidate) ? candidate : DEFAULT_OPENAI_MODEL;
}

export function resolveOpenAIModel(value, env = process.env) {
  const candidate = String(value || '').trim();
  if (!candidate) return configuredOpenAIModel(env);
  if (!OPENAI_MODEL_IDS.includes(candidate)) {
    throw Object.assign(new Error('不支援的智慧模型，請重新選擇'), { code: 'MODEL_NOT_ALLOWED', status: 400 });
  }
  return candidate;
}

export function modelLabel(modelId) {
  return OPENAI_MODELS.find(model => model.id === modelId)?.label || modelId || DEFAULT_OPENAI_MODEL;
}
