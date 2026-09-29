'use strict';
// 플랫폼별 단축키·기기 명사 — Windows 기대값은 그대로, macOS 는 ⌘ 로 바뀐다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Plat = require('./platform');
const P = require('./panel-model');
const MM = require('./memo-model');
const N = require('./notices-model');
const C = require('../../shared/contract');

const key = (o) => ({ ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, key: '', code: '', ...o });

test('플랫폼 감지: userAgentData → platform → userAgent 순, 모르면 win', () => {
  assert.equal(Plat.detect({ userAgentData: { platform: 'macOS' } }), 'mac');
  assert.equal(Plat.detect({ platform: 'MacIntel' }), 'mac');
  assert.equal(Plat.detect({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), 'mac');
  assert.equal(Plat.detect({ userAgentData: { platform: 'Windows' }, platform: 'Win32' }), 'win');
  assert.equal(Plat.detect({}), 'win');
  assert.equal(Plat.detect(undefined), 'win');
  assert.equal(Plat.current(), 'win', 'Node 테스트의 기본 플랫폼은 win(기존 기대값 유지)');
});

test('mac: ⌘1~7 은 계약 순서대로 모드를 고르고 Ctrl 은 무시한다', () => {
  C.MODE_HOTKEY_ORDER.forEach((mode, i) => {
    assert.deepEqual(P.keyAction(key({ metaKey: true, code: `Digit${i + 1}`, key: String(i + 1) }), 'mac'), { type: 'mode', mode });
    assert.equal(P.keyAction(key({ ctrlKey: true, code: `Digit${i + 1}`, key: String(i + 1) }), 'mac'), null, 'mac 에서 Ctrl+숫자는 패널 몫이 아니다');
  });
  assert.equal(P.keyAction(key({ metaKey: true, code: 'Digit8', key: '8' }), 'mac'), null);
  assert.equal(P.keyAction(key({ metaKey: true, altKey: true, code: 'Digit1', key: '1' }), 'mac'), null, '⌘⌥ 는 섞이면 무시');
  assert.equal(P.keyAction(key({ metaKey: true, ctrlKey: true, code: 'Digit1', key: '1' }), 'mac'), null, '⌘⌃ 도 무시');
  assert.equal(P.keyAction(key({ metaKey: true, shiftKey: true, code: 'Digit1', key: '1' }), 'mac'), null, '⌘⇧ 는 무시');
});

test('mac: ⌘S 저장, ⌘Return/⌘NumpadEnter 주 동작, Esc 접기, IME 조합 중은 무시', () => {
  assert.deepEqual(P.keyAction(key({ metaKey: true, key: 's', code: 'KeyS' }), 'mac'), { type: 'save' });
  assert.deepEqual(P.keyAction(key({ metaKey: true, key: 'S', code: 'KeyS' }), 'mac'), { type: 'save' });
  assert.deepEqual(P.keyAction(key({ metaKey: true, key: 'Enter', code: 'Enter' }), 'mac'), { type: 'primary' });
  assert.deepEqual(P.keyAction(key({ metaKey: true, key: 'Enter', code: 'NumpadEnter' }), 'mac'), { type: 'primary' });
  assert.equal(P.keyAction(key({ ctrlKey: true, key: 'Enter', code: 'Enter' }), 'mac'), null);
  assert.equal(P.keyAction(key({ key: 'Enter', code: 'Enter' }), 'mac'), null);
  assert.deepEqual(P.keyAction(key({ key: 'Escape', code: 'Escape' }), 'mac'), { type: 'collapse' });
  assert.equal(P.keyAction(key({ metaKey: true, key: 's', code: 'KeyS', isComposing: true }), 'mac'), null);
  assert.equal(P.keyAction(key({ metaKey: true, key: 'Enter', code: 'Enter', keyCode: 229 }), 'mac'), null);
  assert.equal(P.keyAction(key({ key: 'Escape', code: 'Escape', isComposing: true }), 'mac'), null);
});

test('win: Meta(Win 키)는 여전히 무시한다', () => {
  assert.equal(P.keyAction(key({ metaKey: true, key: 's', code: 'KeyS' }), 'win'), null);
  assert.equal(P.keyAction(key({ ctrlKey: true, metaKey: true, key: 's', code: 'KeyS' }), 'win'), null);
  assert.deepEqual(P.keyAction(key({ ctrlKey: true, key: 's', code: 'KeyS' }), 'win'), { type: 'save' });
  assert.equal(P.keyAction(key({ key: 'Escape', code: 'Escape', metaKey: true }), 'mac'), null, 'Esc 에 ⌘ 이 섞이면 무시(기존 규칙)');
});

test('단축키 표시: win 은 Ctrl+…, mac 은 ⌘…', () => {
  assert.equal(P.hotkeyLabel('tasks', 'win'), 'Ctrl+1');
  assert.equal(P.hotkeyLabel('notifications', 'win'), 'Ctrl+7');
  assert.equal(P.hotkeyLabel('tasks', 'mac'), '⌘1');
  assert.equal(P.hotkeyLabel('notifications', 'mac'), '⌘7');
  assert.equal(P.hotkeyLabel('없는모드', 'mac'), '');
  assert.equal(Plat.hotkey('S', 'win'), 'Ctrl+S');
  assert.equal(Plat.hotkey('S', 'mac'), '⌘S');
  assert.equal(Plat.hotkey('Enter', 'win'), 'Ctrl+Enter');
  assert.equal(Plat.hotkey('Enter', 'mac'), '⌘Return');
  assert.equal(Plat.hotkey('Esc', 'mac'), 'Esc');
});

test('기기 명사: mac 은 이 Mac, win 은 이 PC (저장 키는 그대로)', () => {
  assert.equal(Plat.device('win'), '이 PC');
  assert.equal(Plat.device('mac'), '이 Mac');
  assert.equal(Plat.localize('이 PC에서 숨기기', 'mac'), '이 Mac에서 숨기기');
  assert.equal(Plat.localize('이 PC에서 숨기기', 'win'), '이 PC에서 숨기기');
  assert.equal(MM.statusLabel({ draft: 'a', savedBody: 'a', platform: 'mac' }), 'Hub에 저장됨 · 이 Mac에 보관');
  assert.equal(MM.statusLabel({ saving: true, platform: 'mac' }), '이 Mac에 보관 · Hub 저장 중…');
  assert.equal(MM.statusLabel({ draft: '', platform: 'mac' }), '이 Mac에 자동 저장');
  assert.equal(MM.statusLabel({ draft: 'a', savedBody: 'a', platform: 'win' }), 'Hub에 저장됨 · 이 PC에 보관');
  assert.match(N.bubbleSummary({ hubStatus: 'offline', badge: 0, platform: 'mac' }), /이 Mac에 보관/);
  assert.match(N.bubbleSummary({ hubStatus: 'offline', badge: 0, platform: 'win' }), /이 PC에 보관/);
  assert.match(P.hubStatusView('offline', '', 'mac').detail, /이 Mac에 보관/);
  assert.match(P.hubStatusView('offline', '', 'win').detail, /이 PC에 보관/);
  assert.equal(P.hubStatusView('connected', '', 'mac').label, '연결됨');
});

test('렌더러 문구에 Ctrl·이 PC 가 하드코딩으로 남지 않는다(주석 제외)', () => {
  const dirs = ['modes', '.'];
  const root = path.join(__dirname, '..');
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith('.js') && !n.endsWith('.test.js'))) {
      const code = fs.readFileSync(path.join(root, d, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      for (const m of code.matchAll(/(['"`])((?:(?!\1).)*?(?:Ctrl\+|이 PC)(?:(?!\1).)*?)\1/g)) {
        assert.ok(/L\(\s*$/.test(code.slice(Math.max(0, m.index - 4), m.index)) || false, `${d}/${f}: ${m[2]}`);
      }
    }
  }
});
