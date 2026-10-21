import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoogleAuth } from 'google-auth-library';
import { extractBusinessCard } from './google-vision.js';
import { extractMeetingReviewText } from './meeting-review-extractor.js';
import { extractMultimodalIntakeHub } from './multimodal-intake-core.js';

test('Hub card, meeting and multimodal calls all use Vertex bearer credentials', async () => {
  const names = ['GEMINI_BACKEND', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GEMINI_API_KEY', 'VERCEL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const before = { fetch: globalThis.fetch, token: GoogleAuth.prototype.getAccessToken };
  Object.assign(process.env, { GEMINI_BACKEND: 'vertex', GOOGLE_CLOUD_PROJECT: 'moonlight-credit', GOOGLE_CLOUD_LOCATION: 'global', GEMINI_API_KEY: 'stale-key' });
  delete process.env.VERCEL;
  GoogleAuth.prototype.getAccessToken = async () => 'temporary-token';
  const responses = [{ name: 'Card contact' }, { summary: 'Meeting summary', proposals: [] }, { title: 'Memo', summary: 'Summary', transcription: '', actionItems: [], keyDecisions: [], suggestedTags: [], detectedEntities: { projects: [], peopleOrCompanies: [] } }];
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /aiplatform.googleapis.com\/v1\/projects\/moonlight-credit\//);
    assert.equal(options.headers.Authorization, 'Bearer temporary-token');
    assert.equal(options.headers['x-goog-api-key'], undefined);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(responses[calls++]) }] } }] });
  };
  try {
    assert.equal((await extractBusinessCard('aGVsbG8=')).ok, true);
    assert.equal((await extractMeetingReviewText({ text: 'Meeting source text' })).ok, true);
    assert.equal((await extractMultimodalIntakeHub({ text: 'Memo source text', recordUsage: () => {} })).ok, true);
    assert.equal(calls, 3);
    GoogleAuth.prototype.getAccessToken = async () => { throw new Error('private credential'); };
    assert.equal((await extractBusinessCard('aGVsbG8=')).ok, false);
    assert.equal((await extractMeetingReviewText({ text: 'Meeting source text' })).ok, false);
    assert.equal((await extractMultimodalIntakeHub({ text: 'Memo source text' })).ok, false);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = before.fetch;
    GoogleAuth.prototype.getAccessToken = before.token;
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});
