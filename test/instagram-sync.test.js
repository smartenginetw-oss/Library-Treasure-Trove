import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMediaPages, instagramMediaIsReel } from '../api/_lib/instagram-sync.js';

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
