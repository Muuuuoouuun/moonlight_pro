'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHubUrl, resolveHubUrl, isSameOrigin, dashboardUrl, isExternalOpenable } = require('./hub-url');

test('https는 origin만 남긴다', () => {
  assert.deepEqual(normalizeHubUrl('  https://hub.example.com/dashboard?x=1 '), { ok: true, url: 'https://hub.example.com' });
});

test('http는 localhost·127.0.0.1만 받는다', () => {
  assert.deepEqual(normalizeHubUrl('http://localhost:3000/'), { ok: true, url: 'http://localhost:3000' });
  assert.deepEqual(normalizeHubUrl('http://127.0.0.1:3020'), { ok: true, url: 'http://127.0.0.1:3020' });
  assert.equal(normalizeHubUrl('http://hub.example.com').reason, 'scheme');
  assert.equal(normalizeHubUrl('http://192.168.0.2:3000').reason, 'scheme');
});

test('빈 값·잘못된 값·다른 스킴·계정 정보는 거절한다', () => {
  assert.equal(normalizeHubUrl('').reason, 'empty');
  assert.equal(normalizeHubUrl('hub.example.com').reason, 'invalid');
  assert.equal(normalizeHubUrl('file:///C:/x.html').reason, 'scheme');
  assert.equal(normalizeHubUrl('javascript:alert(1)').reason, 'scheme');
  assert.equal(normalizeHubUrl('https://a:b@hub.example.com').reason, 'credentials');
});

test('설정값이 앱 기본값보다 먼저다', () => {
  assert.equal(resolveHubUrl('https://a.example.com', 'https://b.example.com'), 'https://a.example.com');
  assert.equal(resolveHubUrl('', 'https://b.example.com'), 'https://b.example.com');
  assert.equal(resolveHubUrl(undefined, ''), '');
  assert.equal(resolveHubUrl('http://evil.example.com', ''), '');
});

test('같은 origin만 앱 안에서 연다', () => {
  assert.equal(isSameOrigin('https://hub.example.com/dashboard/work', 'https://hub.example.com'), true);
  assert.equal(isSameOrigin('https://hub.example.com.evil.net/', 'https://hub.example.com'), false);
  assert.equal(isSameOrigin('http://hub.example.com/', 'https://hub.example.com'), false);
  assert.equal(isSameOrigin('file:///C:/settings/index.html', ''), false);
  assert.equal(dashboardUrl('https://hub.example.com'), 'https://hub.example.com/dashboard');
});

test('시스템 브라우저로는 http(s)·mailto만 넘긴다', () => {
  assert.equal(isExternalOpenable('https://www.iana.org/'), true);
  assert.equal(isExternalOpenable('mailto:a@example.com'), true);
  assert.equal(isExternalOpenable('file:///C:/Windows/system32/calc.exe'), false);
  assert.equal(isExternalOpenable('ms-settings:'), false);
});
