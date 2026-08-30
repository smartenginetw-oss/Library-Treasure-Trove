import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMediaPages, fetchCreator, instagramMediaIsReel, instagramSyncErrorMessage } from '../api/_lib/instagram-sync.js';

test('Instagram media classifier keeps reels and excludes ordinary media', () => {
  assert.equal(instagramMediaIsReel({ media_type: 'VIDEO', media_product_type: 'REELS' }), true);
  assert.equal(instagramMediaIsReel({ media_type: 'VIDEO', permalink: 'https://www.instagram.com/reel/ABC/' }), true);
  assert.equal(instagramMediaIsReel({ media_type: 'VIDEO', permalink: 'https://www.instagram.com/p/ABC/' }), false);
  assert.equal(instagramMediaIsReel({ media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/ABC/' }), false);
});

test('Instagram media pages follow cursors, deduplicate IDs, and report truncation', async () => {
  const requests = [];
  const result = await collectMediaPages(
    { data: [{ id: 'media-1' }, { id: 'media-2' }], paging: { next: 'https://graph.example.test/media?after=one' } },
    {
      accessToken: 'test-token',
      maxPages: 2,
      fetchPage: async url => {
        requests.push(url);
        return { data: [{ id: 'media-2' }, { id: 'media-3' }], paging: { next: 'https://graph.example.test/media?after=two' } };
      }
    }
  );
  assert.deepEqual(result.media.map(item => item.id), ['media-1', 'media-2', 'media-3']);
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /access_token=test-token/);
});

test('Instagram media pages stop at the final cursor', async () => {
  const result = await collectMediaPages({ data: [{ id: 'media-1' }] }, { maxPages: 20 });
  assert.equal(result.pages, 1);
  assert.equal(result.truncated, false);
});

test('Instagram creator fetch retries with supported fields when an optional field is rejected', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (urls.length === 1) {
      return new Response(JSON.stringify({ error: { code: 100, message: 'Tried accessing nonexisting field (view_count)' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ business_discovery: { id: 'account-1', name: '測試創作者', followers_count: 10, media: { data: [] } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await fetchCreator({ username: 'test.creator' }, { accessToken: 'token', businessAccountId: 'account-owner', apiVersion: 'v25.0', graphHost: 'https://graph.example.test', mediaPageSize: 50, maxMediaPages: 20 });
    assert.equal(result.account.id, 'account-1');
    assert.equal(result.fieldSetIndex, 1);
    assert.equal(urls.length, 2);
    assert.match(decodeURIComponent(urls[0]), /view_count/);
    assert.doesNotMatch(decodeURIComponent(urls[1]), /view_count/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Instagram token expiry is reported with an actionable Chinese message', () => {
  const message = instagramSyncErrorMessage({ metaCode: 190, message: 'Error validating access token: Session has expired.' });
  assert.match(message, /存取權杖已過期/);
  assert.match(message, /INSTAGRAM_ACCESS_TOKEN/);
});
