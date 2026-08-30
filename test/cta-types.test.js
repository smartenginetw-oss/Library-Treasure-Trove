import test from 'node:test';
import assert from 'node:assert/strict';
import { CTA_TYPES, ensureCtaTypes, inferCtaTypes, normalizeCtaTypes } from '../api/_lib/cta.js';
import { deliverableRow } from '../api/_lib/deliverable.js';

test('CTA types normalize legacy scalar values into an ordered, deduplicated array', () => {
  assert.deepEqual(normalizeCtaTypes('轉發'), ['轉發']);
  assert.deepEqual(normalizeCtaTypes(['分享', '分享', '留言']), ['分享', '留言']);
  assert.deepEqual(normalizeCtaTypes(['留言', '無直接 CTA', '分享']), ['無直接 CTA']);
  assert.deepEqual(ensureCtaTypes(undefined), ['收藏']);
  assert.equal(CTA_TYPES.length, 9);
});

test('CTA inference preserves the order in which calls to action appear', () => {
  assert.deepEqual(inferCtaTypes('轉發到限時動態，留言取得清單，再分享給旅伴'), ['轉發', '留言', '分享']);
  assert.deepEqual(ensureCtaTypes(undefined, '分享給朋友'), ['分享']);
});

test('deliverable rows write canonical cta_types and remove legacy payload key', () => {
  const row = deliverableRow({ id: 'd1', title: '測試', ctaType: '轉發', status: 'READY' }, 'user-1');
  assert.deepEqual(row.cta_types, ['轉發']);
  assert.deepEqual(row.payload.ctaTypes, ['轉發']);
  assert.equal(Object.hasOwn(row.payload, 'ctaType'), false);
});

test('deliverable rows preserve primary-to-secondary CTA order and cap at three', () => {
  const row = deliverableRow({ id: 'd2', title: '多 CTA', ctaTypes: ['轉發', '留言', '分享', '購買'], modelUsed: 'gpt-5.6-sol' }, 'user-1');
  assert.deepEqual(row.cta_types, ['轉發', '留言', '分享']);
  assert.deepEqual(row.payload.ctaTypes, ['轉發', '留言', '分享']);
  assert.equal(row.payload.modelUsed, 'gpt-5.6-sol');
});
