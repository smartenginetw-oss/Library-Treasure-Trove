import { ensureCtaTypes, normalizeCtaTypes, CTA_TYPES } from './cta.js';
import { stringArray, stringValue } from './http.js';

export const ANGLES = ['錯誤', '步驟', '案例', '觀點', '清單'];
export const SEGMENT_KEYS = ['hook', 'pain', 'method', 'case', 'cta'];
export const CAROUSEL_KEYS = ['cover', 'resonance', 'framework', 'method', 'case', 'check', 'cta'];

export const deliverableSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'angle', 'coreMessage', 'audience', 'ctaTypes', 'transcript', 'caption', 'polishNotes', 'segments', 'carouselPages', 'platformVersions', 'shots', 'status'],
  properties: {
    title: { type: 'string' },
    angle: { type: 'string', enum: ANGLES },
    coreMessage: { type: 'string' },
    audience: { type: 'string' },
    ctaTypes: { type: 'array', items: { type: 'string', enum: CTA_TYPES }, minItems: 1, maxItems: 3 },
    transcript: { type: 'string' },
    caption: { type: 'string' },
    polishNotes: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
    segments: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false, required: ['key', 'label', 'text'],
        properties: { key: { type: 'string', enum: SEGMENT_KEYS }, label: { type: 'string' }, text: { type: 'string' } }
      }
    },
    carouselPages: {
      type: 'array', minItems: 7, maxItems: 7,
      items: {
        type: 'object', additionalProperties: false, required: ['key', 'title', 'hint', 'text'],
        properties: { key: { type: 'string', enum: CAROUSEL_KEYS }, title: { type: 'string' }, hint: { type: 'string' }, text: { type: 'string' } }
      }
    },
    platformVersions: {
      type: 'object', additionalProperties: false, required: ['Reels', 'IG 輪播', 'Threads', 'Email'],
      properties: { 'Reels': { type: 'string' }, 'IG 輪播': { type: 'string' }, Threads: { type: 'string' }, Email: { type: 'string' } }
    },
    shots: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false, required: ['shot', 'label', 'scene', 'action', 'check'],
        properties: { shot: { type: 'string' }, label: { type: 'string' }, scene: { type: 'string' }, action: { type: 'string' }, check: { type: 'string' } }
      }
    },
    status: { type: 'string', enum: ['DRAFT'] }
  }
};

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sourceValue(value) {
  const source = objectValue(value);
  return {
    id: stringValue(source.id, 120),
    title: stringValue(source.title, 300),
    summary: stringValue(source.summary, 1800),
    contentTheme: stringValue(source.contentTheme, 100),
    trafficCodes: stringArray(source.trafficCodes, 5, 100),
    hookType: stringValue(source.hookType, 100),
    format: stringValue(source.format, 100),
    commentsSample: stringValue(source.commentsSample || source.comments, 1800)
  };
}

export function deliverableInput(body = {}) {
  const topic = objectValue(body.topic);
  const profile = objectValue(body.profile);
  const cta = stringValue(body.cta, 600);
  return {
    topic: {
      id: stringValue(topic.id, 120),
      title: stringValue(topic.title, 300),
      targetAudience: stringValue(topic.targetAudience, 600),
      contentTheme: stringValue(topic.contentTheme, 120),
      trafficCodes: stringArray(topic.trafficCodes, 5, 100),
      hook: stringValue(topic.hook, 1200),
      hookType: stringValue(topic.hookType, 120),
      whyItWorks: stringValue(topic.whyItWorks, 1600),
      contentStructure: stringArray(topic.contentStructure, 8, 600),
      cta: stringValue(topic.cta, 600),
      differentiation: stringValue(topic.differentiation, 1400),
      angle: stringValue(topic.angle || topic.contentAngle, 100)
    },
    profile: {
      name: stringValue(profile.name, 160),
      primaryNiche: stringValue(profile.primaryNiche, 120),
      positioningSentence: stringValue(profile.positioningSentence, 1200),
      audienceIdentity: stringValue(profile.audienceIdentity, 600),
      audienceProblem: stringValue(profile.audienceProblem, 1800),
      audienceDesiredResult: stringValue(profile.audienceDesiredResult, 1800),
      creatorStrengths: stringArray(profile.creatorStrengths, 20, 500),
      experienceStories: stringArray(profile.experienceStories, 20, 1200),
      audienceQuestions: stringArray(profile.audienceQuestions, 30, 600),
      contentTaboos: stringArray(profile.contentTaboos, 20, 500),
      availableTools: stringArray(profile.availableTools, 20, 300),
      platforms: stringArray(profile.platforms, 10, 100)
    },
    sourceViralContent: sourceValue(body.sourceViralContent),
    coreMessage: stringValue(body.coreMessage, 1600),
    caseText: stringValue(body.caseText, 2200),
    ctaTypes: ensureCtaTypes(body.ctaTypes ?? body.ctaType, cta),
    cta,
    angle: stringValue(body.angle, 100),
    format: stringValue(body.format, 120),
    platforms: stringArray(body.platforms, 10, 100)
  };
}

function trimText(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validateArrayItems(value, count, name) {
  if (!Array.isArray(value) || value.length !== count || value.some(item => !item || typeof item !== 'object')) {
    throw Object.assign(new Error(`智慧服務的${name}格式無效`), { code: 'AI_INVALID_OUTPUT', status: 502 });
  }
}

export function validateOutput(value, expectedCtaTypes = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('智慧服務回傳格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (deliverableSchema.required.some(key => value[key] === undefined || value[key] === null)) throw Object.assign(new Error('智慧服務缺少內容交付欄位'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (!ANGLES.includes(String(value.angle).trim())) throw Object.assign(new Error('智慧服務回傳的內容切角無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (value.status !== 'DRAFT') throw Object.assign(new Error('智慧服務回傳的交付包狀態無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (!Array.isArray(value.ctaTypes) || value.ctaTypes.length < 1 || value.ctaTypes.length > 3) throw Object.assign(new Error('智慧服務回傳的行動邀請格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  const ctaTypes = normalizeCtaTypes(value.ctaTypes);
  if (!ctaTypes.length || ctaTypes.length !== value.ctaTypes.length || ctaTypes.some(type => !CTA_TYPES.includes(type))) throw Object.assign(new Error('智慧服務回傳的行動邀請格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (Array.isArray(expectedCtaTypes) && JSON.stringify(ctaTypes) !== JSON.stringify(expectedCtaTypes)) throw Object.assign(new Error('智慧服務回傳了未指定的行動邀請類型'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (!trimText(value.title, 300) || !trimText(value.coreMessage, 1600) || !trimText(value.audience, 600)) throw Object.assign(new Error('智慧服務回傳的核心文案欄位無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (!trimText(value.transcript, 7000) || !trimText(value.caption, 5000)) throw Object.assign(new Error('智慧服務回傳的逐字稿或貼文文案無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  if (!Array.isArray(value.polishNotes) || value.polishNotes.length < 2 || value.polishNotes.length > 6 || value.polishNotes.some(note => typeof note !== 'string' || !note.trim())) throw Object.assign(new Error('智慧服務回傳的潤稿說明格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  const polishNotes = value.polishNotes.map(note => trimText(note, 500)).filter(Boolean).slice(0, 6);
  if (polishNotes.length < 2) throw Object.assign(new Error('智慧服務回傳的潤稿說明格式無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  validateArrayItems(value.segments, 5, '母內容段落');
  validateArrayItems(value.carouselPages, 7, '輪播頁面');
  validateArrayItems(value.shots, 5, '拍攝分鏡');
  if (JSON.stringify(value.segments.map(item => item.key)) !== JSON.stringify(SEGMENT_KEYS) || JSON.stringify(value.carouselPages.map(item => item.key)) !== JSON.stringify(CAROUSEL_KEYS)) throw Object.assign(new Error('智慧服務回傳的內容順序無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  for (const segment of value.segments) {
    if (typeof segment.label !== 'string' || !trimText(segment.text, 1800)) throw Object.assign(new Error('智慧服務回傳的母內容文字無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  }
  for (const page of value.carouselPages) {
    if (typeof page.title !== 'string' || typeof page.hint !== 'string' || !trimText(page.text, 1000)) throw Object.assign(new Error('智慧服務回傳的輪播內容無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  }
  if (!value.platformVersions || typeof value.platformVersions !== 'object' || Array.isArray(value.platformVersions) || Object.keys(value.platformVersions).some(key => !['Reels', 'IG 輪播', 'Threads', 'Email'].includes(key)) || Object.keys(value.platformVersions).length !== 4 || ['Reels', 'IG 輪播', 'Threads', 'Email'].some(key => !trimText(value.platformVersions[key], 5000))) throw Object.assign(new Error('智慧服務回傳的平台版本無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  for (const shot of value.shots) {
    if (typeof shot.shot !== 'string' || !trimText(shot.label, 100) || !trimText(shot.scene, 300) || !trimText(shot.action, 500) || !trimText(shot.check, 300)) throw Object.assign(new Error('智慧服務回傳的分鏡欄位無效'), { code: 'AI_INVALID_OUTPUT', status: 502 });
  }
  return {
    title: trimText(value.title, 300), angle: value.angle.trim(), coreMessage: trimText(value.coreMessage, 1600), audience: trimText(value.audience, 600), ctaTypes,
    transcript: trimText(value.transcript, 7000), caption: trimText(value.caption, 5000), polishNotes,
    segments: value.segments.map(segment => ({ key: segment.key, label: trimText(segment.label, 100), text: trimText(segment.text, 1800) })),
    carouselPages: value.carouselPages.map(page => ({ key: page.key, title: trimText(page.title, 160), hint: trimText(page.hint, 400), text: trimText(page.text, 1000) })),
    platformVersions: Object.fromEntries(['Reels', 'IG 輪播', 'Threads', 'Email'].map(key => [key, trimText(value.platformVersions[key], 5000)])),
    shots: value.shots.map(shot => ({ shot: trimText(shot.shot, 20), label: trimText(shot.label, 100), scene: trimText(shot.scene, 300), action: trimText(shot.action, 500), check: trimText(shot.check, 300) })), status: 'DRAFT'
  };
}

export function buildPrompt(input) {
  return [
    '你是「藏書閣寶典」的繁體中文短影音文案總編與拍攝導演。請把指定選題轉成一份可直接修改、拍攝與發布的原創內容交付包。',
    '請嚴格只輸出符合 JSON Schema 的 JSON，不要 Markdown、前言或額外文字。',
    '保留選題的受眾、核心觀點與內容切角，但不要複製來源案例的標題、句子、字幕、腳本、人物、故事或具體情節。',
    '所有內容必須使用自然的繁體中文；資料不足時要在潤稿說明或內容中標記「請補上真實案例／數字」，不可自行編造證據。',
    '母內容請包含：鉤子、痛點、方法、案例、行動邀請；transcript 是 Reels 可直接念的完整逐字稿；caption 是社群貼文說明；polishNotes 說明你做了哪些語氣、節奏或原創邊界處理。',
    'CTA 必須只使用輸入指定的行動邀請類型，最多三個，順序代表主要到次要；「分享」與「轉發」要分開。',
    '輸入資料：', JSON.stringify(input)
  ].join('\n');
}
