'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  WIDGET_CHANNELS,
  widgetUrl,
  isLoginUrl,
  mainLoginUrl,
  isWidgetPage,
  resolveMainPath,
  clampWidgetHeight,
  normalizeWidgetState,
  defaultWidgetPosition,
  clampIntoWorkArea,
  resolveWidgetPosition,
  widgetToggleAction,
} = require('./widget-window');

const HUB = 'https://hub.example.com';
const SIZE = { width: 380, height: 200 };
const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };

test('위젯 주소는 허브 origin의 /widget', () => {
  assert.equal(widgetUrl('https://hub.example.com/dashboard?x=1'), 'https://hub.example.com/widget');
  assert.equal(widgetUrl(''), '');
  assert.equal(widgetUrl('not a url'), '');
});

test('로그인 화면으로 간 것만 로그인으로 본다', () => {
  assert.equal(isLoginUrl('https://hub.example.com/login?next=%2Fwidget', HUB), true);
  assert.equal(isLoginUrl('https://hub.example.com/login/', HUB), true);
  assert.equal(isLoginUrl('https://hub.example.com/widget', HUB), false);
  assert.equal(isLoginUrl('https://hub.example.com/loginx', HUB), false);
  assert.equal(isLoginUrl('https://other.example.com/login', HUB), false);
  assert.equal(isLoginUrl('https://hub.example.com/login', ''), false);
});

test('메인 창은 위젯의 로그인 주소에서 next=/widget을 물려받지 않는다', () => {
  // 허브 미들웨어가 보내는 모양 그대로 → next를 지워 로그인 뒤 /dashboard로 간다.
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fwidget', HUB), 'https://hub.example.com/login');
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fwidget%3Fx%3D1', HUB), 'https://hub.example.com/login');
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fwidget%2Fsub', HUB), 'https://hub.example.com/login');
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=https%3A%2F%2Fhub.example.com%2Fwidget', HUB), 'https://hub.example.com/login');
  // 다른 쿼리는 남기고 next만 지운다.
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fwidget&reason=expired', HUB), 'https://hub.example.com/login?reason=expired');
  // 위젯이 아닌 목적지는 그대로 둔다(/widgets는 위젯 화면이 아니다).
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fdashboard%2Fhome', HUB), 'https://hub.example.com/login?next=%2Fdashboard%2Fhome');
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fwidgets', HUB), 'https://hub.example.com/login?next=%2Fwidgets');
  assert.equal(mainLoginUrl('https://hub.example.com/login', HUB), 'https://hub.example.com/login');
  // 로그인 주소가 아니면 판정하지 않는다.
  assert.equal(mainLoginUrl('https://hub.example.com/widget', HUB), null);
  assert.equal(mainLoginUrl('https://other.example.com/login?next=%2Fwidget', HUB), null);
  assert.equal(mainLoginUrl('https://hub.example.com/login?next=%2Fwidget', ''), null);
});

test('위젯 화면 판정', () => {
  assert.equal(isWidgetPage('https://hub.example.com/widget', HUB), true);
  assert.equal(isWidgetPage('https://hub.example.com/widget?focus=1', HUB), true);
  assert.equal(isWidgetPage('https://hub.example.com/login?next=/widget', HUB), false);
  assert.equal(isWidgetPage('about:blank', HUB), false);
  assert.equal(isWidgetPage('https://evil.example.com/widget', HUB), false);
});

test('openMain은 허브 안의 경로만 받는다', () => {
  assert.deepEqual(resolveMainPath('/dashboard/work?task=1#x', HUB), { ok: true, url: 'https://hub.example.com/dashboard/work?task=1#x' });
  assert.deepEqual(resolveMainPath('/', HUB), { ok: true, url: 'https://hub.example.com/' });
  for (const bad of ['dashboard', '//evil.example.com/x', '/\\evil.example.com', 'https://evil.example.com/', 'javascript:alert(1)', '/a\nb', '', null, 42]) {
    assert.equal(resolveMainPath(bad, HUB).ok, false, String(bad));
  }
  assert.equal(resolveMainPath('/dashboard', '').reason, 'no-hub');
});

test('높이 요청은 140–360px로 자른다', () => {
  assert.equal(clampWidgetHeight(200), 200);
  assert.equal(clampWidgetHeight(90), 140);
  assert.equal(clampWidgetHeight(900), 360);
  assert.equal(clampWidgetHeight(201.6), 202);
  assert.equal(clampWidgetHeight(Number.NaN), null);
  assert.equal(clampWidgetHeight('300'), null);
});

test('저장 상태 정리: 좌표 없으면 기본 위치, 고정은 기본 켜짐', () => {
  assert.deepEqual(normalizeWidgetState(null), { x: null, y: null, pinned: true });
  assert.deepEqual(normalizeWidgetState({ x: 10.4, y: 20, pinned: false }), { x: 10, y: 20, pinned: false });
  assert.deepEqual(normalizeWidgetState({ x: 10, pinned: 'no' }), { x: null, y: null, pinned: true });
});

test('기본 위치는 주 모니터 작업 영역 오른쪽 아래 16px', () => {
  assert.deepEqual(defaultWidgetPosition(PRIMARY, SIZE), { x: 1920 - 380 - 16, y: 1040 - 200 - 16 });
  assert.deepEqual(resolveWidgetPosition(normalizeWidgetState({}), SIZE, null, PRIMARY), { x: 1524, y: 824 });
});

test('저장 좌표는 현재 작업 영역 안으로 민다', () => {
  const second = { x: 1920, y: 0, width: 1280, height: 984 };
  assert.deepEqual(clampIntoWorkArea({ x: 3300, y: 900 }, SIZE, second), { x: 1920 + 1280 - 380, y: 984 - 200 });
  assert.deepEqual(clampIntoWorkArea({ x: -500, y: -50 }, SIZE, PRIMARY), { x: 0, y: 0 });
  assert.deepEqual(resolveWidgetPosition({ x: 100, y: 100, pinned: true }, SIZE, PRIMARY, PRIMARY), { x: 100, y: 100 });
  // 모니터가 빠져 저장 좌표가 먼 곳이면 가장 가까운 작업 영역 안으로.
  assert.deepEqual(resolveWidgetPosition({ x: 5000, y: 5000, pinned: true }, SIZE, PRIMARY, PRIMARY), { x: 1540, y: 840 });
});

test('토글: 주소 없으면 설정, 떠 있으면 숨기기', () => {
  assert.equal(widgetToggleAction({ hubUrl: '', visible: false }), 'settings');
  assert.equal(widgetToggleAction({ hubUrl: HUB, visible: true }), 'hide');
  assert.equal(widgetToggleAction({ hubUrl: HUB, visible: false }), 'show');
});

test('프리로드 채널은 WIDGET_CHANNELS와 같다', () => {
  const source = fs.readFileSync(path.join(__dirname, 'widget-preload.js'), 'utf8');
  const used = [...source.matchAll(/'(moonlight-widget:[a-z-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(used, Object.values(WIDGET_CHANNELS).sort());
  assert.doesNotMatch(source, /nodeIntegration|require\('\.\//);
});
