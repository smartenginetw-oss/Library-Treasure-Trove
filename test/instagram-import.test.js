import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthState, decryptAccessToken, encryptAccessToken, verifyOAuthState } from '../api/_lib/instagram-oauth.js';
import { manualImportRow, normalizeInstagramUrl } from '../api/_lib/manual-import.js';

test('manual Instagram import only accepts secure post or Reel URLs', () => {
  assert.equal(normalizeInstagramUrl('https://www.instagram.com/reel/ABC123/?igsh=tracking'), 'https://www.instagram.com/reel/ABC123');
  assert.equal(normalizeInstagramUrl('https://instagram.com/p/XYZ/'), 'https://instagram.com/p/XYZ');
  assert.throws(() => normalizeInstagramUrl('http://www.instagram.com/reel/ABC'), error => error.code === 'IMPORT_URL_INVALID');
  assert.throws(() => normalizeInstagramUrl('https://example.com/reel/ABC'), error => error.code === 'IMPORT_URL_INVALID');
  assert.throws(() => normalizeInstagramUrl('https://www.instagram.com/eden_ey/'), error => error.code === 'IMPORT_URL_INVALID');
});

test('manual import row is user-owned and bounds numeric metadata', () => {
  const row = manualImportRow({ sourceUrl: 'https://www.instagram.com/reel/ABC/', creatorHandle: '@eden_ey', views: '123', summary: '  摘要  ' }, 'user-1');
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.source_url, 'https://www.instagram.com/reel/ABC');
  assert.equal(row.creator_handle, '@eden_ey');
  assert.equal(row.views, 123);
  assert.equal(row.summary, '摘要');
  assert.throws(() => manualImportRow({ sourceUrl: 'https://www.instagram.com/reel/ABC/', views: '-1' }, 'user-1'), error => error.code === 'IMPORT_NUMBER_INVALID');
});

test('OAuth state is signed, expires, and access tokens are encrypted at rest', () => {
  const secret = 'state-secret-for-test';
  const state = createOAuthState({ userId: 'user-1', secret, now: 1_700_000_000_000, ttlSeconds: 600 });
  assert.equal(verifyOAuthState(state, secret, 1_700_000_100_000).userId, 'user-1');
  assert.throws(() => verifyOAuthState(`${state}x`, secret, 1_700_000_100_000), error => error.code === 'INSTAGRAM_OAUTH_STATE_INVALID');
  assert.throws(() => verifyOAuthState(state, secret, 1_700_001_000_000), error => error.code === 'INSTAGRAM_OAUTH_STATE_INVALID');
  const ciphertext = encryptAccessToken('secret-token', 'encryption-secret');
  assert.notEqual(ciphertext, 'secret-token');
  assert.equal(decryptAccessToken(ciphertext, 'encryption-secret'), 'secret-token');
  assert.throws(() => decryptAccessToken(ciphertext, 'wrong-secret'), error => error.code === 'INSTAGRAM_TOKEN_INVALID');
});

