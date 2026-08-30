import test from 'node:test';
import assert from 'node:assert/strict';
import { viralBatchRows, viralRow } from '../api/admin-viral.js';

const validCase = {
  title: '台北平價美食探店',
  creatorName: '測試創作者',
  creatorHandle: '@creator',
  platform: 'Instagram',
  niche: 'Food',
  sourceUrl: 'https://www.instagram.com/reel/example/',
  followers: 10000,
  views: 120000,
  likes: 6000,
  comments: 120
};

test('viral rows without an id use a stable source URL id', () => {
  const first = viralRow(validCase, 'user-1');
  const second = viralRow(validCase, 'user-2');
  assert.equal(first.id, second.id);
  assert.match(first.id, /^v_[a-f0-9]{32}$/);
});

test('viral batch rejects incomplete rows before writing', () => {
  const result = viralBatchRows([
    validCase,
    { title: '缺少指標', creatorName: '測試創作者' }
  ], 'admin-1');
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 2);
  assert.match(result.errors[0].message, /粉絲數與觀看數/);
});

test('viral batch rejects duplicate source URLs and accepts a complete row', () => {
  const result = viralBatchRows([validCase, { ...validCase, title: '重複網址' }], 'admin-1');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 2);
  assert.match(result.errors[0].message, /編號重複/);
});

test('viral batch caps the number of rows', () => {
  const result = viralBatchRows(Array.from({ length: 101 }, (_, index) => ({ ...validCase, id: `row-${index}` })), 'admin-1');
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /100/);
});
