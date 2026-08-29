import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, setJsonHeaders } from '../api/_lib/http.js';

function responseStub() {
  const headers = new Map();
  return { headers, setHeader(name, value) { headers.set(name, value); } };
}

test('readJson returns a clear 400 error for malformed JSON', () => {
  assert.throws(() => readJson({ body: '{"broken"' }), error => error.code === 'INVALID_JSON' && error.status === 400);
});

test('CORS is opt-in when APP_ORIGIN is not configured', () => {
  const previous = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  const response = responseStub();
  setJsonHeaders(response, { headers: { origin: 'https://untrusted.example' } });
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  if (previous === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previous;
});

test('CORS allows the explicitly configured application origin', () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://app.example.com';
  const response = responseStub();
  setJsonHeaders(response, { headers: { origin: 'https://app.example.com' } });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com');
  if (previous === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previous;
});
