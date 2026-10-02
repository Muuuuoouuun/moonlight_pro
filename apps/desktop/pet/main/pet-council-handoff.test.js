'use strict';
// Mac PetActivityStoreTests 의 Council 전달 검사 + 허브 수신기(apps/hub council-desktop-handoff.js)와의 왕복 확인.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { councilHandoffPath, parseCouncilDesktopHandoff, COUNCIL_PATH, COUNCIL_HANDOFF_PREFIX } = require('./pet-council-handoff');
const { councilHandoffUrl } = require('./pet-hub');

const HUB_HANDOFF = pathToFileURL(path.join(__dirname, '..', '..', '..', 'hub', 'components', 'hub', 'council-desktop-handoff.js')).href;

function decode(fragment) {
  const encoded = fragment.slice(COUNCIL_HANDOFF_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

test('유니코드·결합 문자·공백·기호를 그대로, 고정 Council 경로의 조각에만 싣는다', () => {
  const text = '한글과 🌓, 이브이 👨‍👩‍👧‍👦\n줄바꿈 é &?#=+/% ';
  const handoff = councilHandoffUrl(text, 'memo');
  assert.ok(handoff.startsWith(`${COUNCIL_PATH}${COUNCIL_HANDOFF_PREFIX}`));
  const url = new URL(handoff, 'https://hub.example.test');
  assert.equal(url.pathname, '/dashboard/agents/council');
  assert.equal(url.search, '');
  const fragment = handoff.slice(COUNCIL_PATH.length);
  assert.match(fragment.slice(COUNCIL_HANDOFF_PREFIX.length), /^[A-Za-z0-9_-]+$/);
  const payload = decode(fragment);
  assert.deepEqual(payload, { version: 1, draft: text, source: { kind: 'memo' } });
  assert.deepEqual(parseCouncilDesktopHandoff(fragment), { ok: true, payload });
});

test('정확히 4000 UTF-16 은 통과, 4001·공백만·외톨이 서로게이트·모르는 출처는 거절', () => {
  const full = '🌓'.repeat(2000);
  assert.equal(full.length, 4000);
  assert.ok(councilHandoffPath(full, 'text'));
  assert.throws(() => councilHandoffPath(`${full}가`, 'text'), TypeError);
  assert.throws(() => councilHandoffPath(' \n\t', 'text'), TypeError);
  assert.throws(() => councilHandoffPath('안건 \ud83c', 'text'), TypeError);
  assert.throws(() => councilHandoffPath('안건', 'email'), TypeError);
  assert.throws(() => councilHandoffPath(null), TypeError);
});

test('허브 수신기가 펫이 만든 조각을 같은 안건으로 읽는다(인코딩 동일)', async () => {
  const hub = await import(HUB_HANDOFF);
  for (const [draft, kind] of [['안건 검증', 'task'], ['한글과 🌓 & ?#=', 'memo'], ['🌓'.repeat(2000), 'text']]) {
    const path1 = councilHandoffPath(draft, kind);
    const fragment = path1.slice(COUNCIL_PATH.length);
    assert.equal(fragment, hub.encodeCouncilDesktopHandoff({ version: 1, draft, source: { kind } }), '허브 인코더와 바이트 단위로 같다');
    assert.deepEqual(hub.parseCouncilDesktopHandoff(fragment), { ok: true, payload: { version: 1, draft, source: { kind } } });
  }
  assert.equal(hub.COUNCIL_HANDOFF_DRAFT_LIMIT, 4000);
  assert.equal(hub.COUNCIL_HANDOFF_FRAGMENT_LIMIT, 24000);
});
