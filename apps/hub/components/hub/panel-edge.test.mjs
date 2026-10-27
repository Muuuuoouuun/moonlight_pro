import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// 테두리 대신 음영(2026-10-22 운영자 "컴포넌트·창·탭 기준이 제각각, 테두리보다 음영 입체감").
// 판·창은 그림자 토큰으로 뜨고, 사방 테두리는 --panel-edge(depth C에서 투명)만 쓴다.
// 그림자 토큰과 1px 선 테두리를 함께 쓰는 판이 새로 생기면 여기서 막힌다.
const HUB = new URL('../../', import.meta.url);
const SHADOW = /var\(--(shadow-card|shadow-panel|fx-shadow|brief-panel-shadow|shadow-pop|shadow-window)\)/;
const LINE_BORDER = /border:\s*['"`]?1px solid var\(--(line-soft|line|line-strong)\)/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.next')) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    if (entry.isDirectory()) walk(child, out);
    else if (/\.(css|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(child);
  }
  return out;
}

// style={{ ... }} 객체를 괄호 짝으로 잘라 낸다(여러 줄 객체 포함).
function styleObjects(source) {
  const objects = [];
  for (let at = source.indexOf('style={{'); at !== -1; at = source.indexOf('style={{', at + 8)) {
    let depth = 0;
    for (let i = at + 7; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}' && --depth === 0) { objects.push(source.slice(at, i + 1)); break; }
    }
  }
  return objects;
}

test('판과 창은 그림자로 뜨고, 사방 테두리는 --panel-edge만 쓴다', () => {
  const offenders = [];
  for (const file of walk(HUB)) {
    const source = readFileSync(file, 'utf8');
    const name = file.pathname.split('/apps/hub/')[1];
    if (name.endsWith('.css')) {
      for (const [, selector, body] of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (SHADOW.test(body) && LINE_BORDER.test(body)) offenders.push(`${name} :: ${selector.trim().split('\n').pop()}`);
      }
    } else {
      for (const object of styleObjects(source)) {
        if (SHADOW.test(object) && LINE_BORDER.test(object)) offenders.push(`${name} :: ${object.slice(0, 80).replace(/\s+/g, ' ')}`);
      }
    }
  }
  assert.deepEqual(offenders, [], '판 테두리는 1px solid var(--panel-edge)로 — depth C가 음영으로 경계를 대신한다');
});

test('depth C는 판·창 경계를 투명으로, 탭 묶음을 눌린 트랙 + 잉크 현재 칸으로 맞춘다', () => {
  const tokens = readFileSync(new URL('./hub-tokens.css', import.meta.url), 'utf8');
  const depth = readFileSync(new URL('./hub-depth.css', import.meta.url), 'utf8');
  const primitives = readFileSync(new URL('./hub-primitives.jsx', import.meta.url), 'utf8');
  assert.match(tokens, /--panel-edge: var\(--line-soft\);/, '기본(로그인)은 1px 선 그대로');
  assert.match(depth, /--panel-edge: transparent;/);
  assert.match(primitives, /border: '1px solid var\(--panel-edge\)'/, 'Card');
  // 탭 묶음 셋(세그먼트·Tabs·탑바 탭)이 한 모양
  assert.match(depth, /--seg-radius: var\(--fx-pill\);/);
  assert.match(primitives, /borderRadius: 'var\(--seg-radius, var\(--r-sm\)\)'/);
  assert.match(depth, /\.hub-tabs,\n\.hub-app\[data-visual-system="depth-c"\] \.hub-topbar__tabs \{[^}]*background: var\(--well\);[^}]*box-shadow: var\(--shadow-inset\);/);
  assert.match(depth, /\.hub-tabs__tab\[aria-selected="true"\],\n\.hub-app\[data-visual-system="depth-c"\] \.hub-topbar__tabs button\[aria-current="page"\] \{[^}]*background: var\(--ink-face\);/);
  assert.doesNotMatch(primitives, /borderBottom: `1px solid \$\{isActive/, 'Tabs 밑줄은 CSS(.hub-tabs)가 소유');
  // 사이드 창은 떠 있는 판
  assert.match(primitives, /top: 'var\(--drawer-gap, 0px\)'/);
  assert.match(depth, /--drawer-gap: 12px;[\s\S]*--drawer-edge: transparent;[\s\S]*--drawer-shadow: var\(--shadow-window\);/);
});
