import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, deliverableInput, validateOutput } from '../api/_lib/generate-deliverable.js';
import { configuredOpenAIModel, OPENAI_MODEL_IDS, resolveOpenAIModel } from '../api/_lib/openai-models.js';

const segmentKeys = ['hook', 'pain', 'method', 'case', 'cta'];
const pageKeys = ['cover', 'resonance', 'framework', 'method', 'case', 'check', 'cta'];

function validOutput(ctaTypes = ['留言']) {
  return {
    title: '三步把陌生人問題變成可拍內容',
    angle: '步驟',
    coreMessage: '先把受眾卡點拆成一個今天能完成的動作。',
    audience: '剛開始穩定產出的內容創作者',
    ctaTypes,
    transcript: '如果你總是知道要做，卻不知道先做哪一步，今天先試這個方法。',
    caption: '把受眾問題拆小，內容才有機會真的被完成。留言「清單」取得檢核表。',
    polishNotes: ['開頭改成直接點出受眾處境。', '案例位置保留真實資料插槽，不替創作者編造。'],
    segments: segmentKeys.map((key, index) => ({ key, label: ['鉤子', '痛點', '方法', '案例', '行動邀請'][index], text: `${key} 段落內容，請補上可驗證的細節。` })),
    carouselPages: pageKeys.map((key, index) => ({ key, title: `第 ${index + 1} 頁`, hint: '一頁一個重點。', text: `輪播第 ${index + 1} 頁內容。` })),
    platformVersions: { Reels: 'Reels 版本', 'IG 輪播': 'IG 輪播版本', Threads: 'Threads 版本', Email: 'Email 版本' },
    shots: Array.from({ length: 5 }, (_, index) => ({ shot: String(index + 1).padStart(2, '0'), label: '方法', scene: '正面近景', action: '展示操作', check: '收音清楚' })),
    status: 'DRAFT'
  };
}

test('deliverable input keeps only bounded topic/profile fields and canonical CTA order', () => {
  const input = deliverableInput({
    topic: { id: 't1', title: '測試題目', contentStructure: ['一', '二', '三'], angle: '案例' },
    profile: { name: '測試創作者', experienceStories: ['真實案例'] },
    ctaTypes: ['分享', '分享', '轉發'],
    caseText: '前後差異'
  });
  assert.deepEqual(input.ctaTypes, ['分享', '轉發']);
  assert.equal(input.topic.title, '測試題目');
  assert.equal(input.profile.experienceStories[0], '真實案例');
  assert.match(buildPrompt(input), /繁體中文/);
});

test('deliverable output validates the complete editable contract', () => {
  const output = validateOutput(validOutput(['分享', '轉發']), ['分享', '轉發']);
  assert.equal(output.status, 'DRAFT');
  assert.deepEqual(output.ctaTypes, ['分享', '轉發']);
  assert.equal(output.segments.length, 5);
  assert.equal(output.carouselPages.length, 7);
  assert.equal(output.shots.length, 5);
});

test('deliverable output rejects CTA types that differ from the user selection', () => {
  assert.throws(() => validateOutput(validOutput(['轉發']), ['分享']), error => error.code === 'AI_INVALID_OUTPUT');
  const invalid = validOutput(['不存在']);
  assert.throws(() => validateOutput(invalid), error => error.code === 'AI_INVALID_OUTPUT');
});

test('deliverable output rejects missing transcript or malformed sequence', () => {
  const missingTranscript = validOutput();
  missingTranscript.transcript = '';
  assert.throws(() => validateOutput(missingTranscript), error => error.code === 'AI_INVALID_OUTPUT');
  const wrongOrder = validOutput();
  wrongOrder.segments[0].key = 'pain';
  assert.throws(() => validateOutput(wrongOrder), error => error.code === 'AI_INVALID_OUTPUT');
});

test('OpenAI model resolver accepts the supported model IDs and records a safe default', () => {
  assert.deepEqual(OPENAI_MODEL_IDS, [
    'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5',
    'gpt-5.4', 'gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini'
  ]);
  assert.equal(resolveOpenAIModel('gpt-5.6-sol', {}), 'gpt-5.6-sol');
  assert.equal(configuredOpenAIModel({ OPENAI_MODEL: 'gpt-5.6-terra' }), 'gpt-5.6-terra');
  assert.equal(configuredOpenAIModel({ OPENAI_MODEL: 'not-a-model' }), 'gpt-4o-mini');
  assert.equal(resolveOpenAIModel('', { OPENAI_MODEL: 'gpt-5.4-mini' }), 'gpt-5.4-mini');
});

test('OpenAI model resolver rejects IDs outside the server allowlist', () => {
  assert.throws(() => resolveOpenAIModel('gpt-unknown', {}), error => error.code === 'MODEL_NOT_ALLOWED' && error.status === 400);
});
