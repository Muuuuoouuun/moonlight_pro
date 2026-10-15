'use strict';
// 렌더러 정적 계약 — 다리 채널 이름, 페이지 스크립트 순서·CSP, 유리 값, 자산·글꼴 경로.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../shared/contract');

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
function sources(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.(js|html)$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

test('렌더러가 부르는 채널·이벤트는 모두 계약에 있다', () => {
  const known = new Set([...C.PET_INVOKE, ...C.PET_EVENTS]);
  const unknown = [];
  for (const f of sources(DIR)) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/'(pet:[a-z-]+)'/g)) if (!known.has(m[1])) unknown.push(`${path.basename(f)} → ${m[1]}`);
  }
  assert.deepEqual(unknown, []);
});

test('페이지는 계약을 모델보다 먼저, 다리를 모드보다 먼저 읽고 CSP 로 외부를 막는다', () => {
  for (const page of ['panel.html', 'pet.html', 'perch.html', 'bubble.html', 'focus.html']) {
    const html = read(page);
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order.slice(0, 3), ['core/contract-begin.js', '../shared/contract.js', 'core/contract-end.js'], page);
    assert.ok(order.indexOf('core/bridge.js') > 2, `${page}: bridge`);
    for (const src of order) assert.ok(fs.existsSync(path.join(DIR, src)), `${page}: ${src} 없음`);
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; script-src 'self'/, page);
    assert.doesNotMatch(html, /<script>(?!<\/script>)/, `${page}: 인라인 스크립트 금지`);
  }
  const panel = read('panel.html');
  for (const mode of [...C.MODES, 'hub-status']) assert.match(panel, new RegExp(`modes/${mode}\\.js`), mode);
});

test('플랫폼 감지는 먼저 실행하고 Mac 네이티브·HUD 대체·Windows 반경을 따로 유지한다', () => {
  for (const page of ['panel.html', 'pet.html', 'perch.html', 'bubble.html', 'focus.html']) {
    const order = [...read(page).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(order[3], 'model/platform.js', page);
  }
  assert.match(read('glass.css'), /html\[data-platform="mac"\] \{\s*--radius: 10px;/);
  assert.match(read('bubble.css'), /html\[data-platform="mac"\] \{ --radius: 10px; \}/);
  assert.match(read('glass.css'), /html\[data-material="native-clear"\] \{ --radius: 26px; \}/);
  assert.match(read('bubble.css'), /html\[data-platform="mac"\]\[data-material="native-clear"\] \{ --radius: 14px; \}/);
  assert.match(read('glass.css'), /--radius: 8px;/, 'Windows Acrylic radius');
});

test('유리 값은 승인값 그대로다', () => {
  const css = read('glass.css');
  assert.ok(css.includes('0 .35px .65px rgba(0, 0, 0, .73), 0 .5px 1.6px rgba(0, 0, 0, .37)'), '글자 그림자');
  assert.match(css, /rgba\(0, 0, 0, \.09\) 0%, rgba\(0, 0, 0, \.09\) 35%/, '중앙 음영 9%/35%');
  assert.match(css, /rgba\(255, 255, 255, \.60\) 0%, rgba\(255, 255, 255, \.10\) 38%,\s*rgba\(255, 255, 255, \.12\) 66%, rgba\(255, 255, 255, \.36\) 100%/, '림');
  assert.match(css, /--dur-wash: 120ms/);
  assert.match(css, /html\.opaque, html\.opaque body \{ background: var\(--opaque-bg\); \}/);
  assert.match(css, /--opaque-bg: #141C27/);
  assert.equal(C.GLASS.textShadowNear, 0.73);
  assert.equal(C.GLASS.centerShade, 0.09);
});

test('유리 층 순서: 베일 → 중앙 음영 → (캐릭터 색) → 곡면 단면 셋 → 1px 입술 — 패널·말풍선 같다', () => {
  const layers = (page) => [...read(page).matchAll(/class="layer ([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(layers('panel.html'), ['veil', 'shade', 'wash', 'section', 'section-fine', 'prism', 'rim']);
  assert.deepEqual(layers('bubble.html'), ['veil', 'shade', 'section', 'section-fine', 'prism', 'rim']);
});

test('곡면 단면·베일·캐릭터 색 값은 계약 GLASS 와 같고, 불투명·강제 색에서는 꺼진다', () => {
  const css = read('glass.css');
  const G = C.GLASS;
  // 선언값을 숫자로 읽는다(.30 과 0.3 을 같게). 같은 이름이 여러 번이면 첫 선언(다크·기본).
  const decl = (name, scope = css) => {
    const m = scope.match(new RegExp(`${name}: (\\.?[\\d.]+)(px)?;`));
    assert.ok(m, `${name} 선언 없음`);
    return Number(m[1]);
  };
  assert.equal(decl('--section-gain'), G.sectionGain);
  assert.equal(decl('--shoulder-a'), G.shoulder);
  assert.equal(decl('--return-a'), G.innerReturn);
  assert.equal(decl('--attenuation-a'), G.innerAttenuation);
  assert.equal(decl('--prism-a'), G.prism);
  assert.equal(decl('--wash-feather'), G.washFeather);
  const interior = css.match(/linear-gradient\(rgb\(0 0 0 \/ ([.\d]+)\) 0 0\)/);
  assert.ok(interior && Number(interior[1]) === G.washInterior, '캐릭터 색의 면 비율');
  assert.equal(decl('--veil-a'), G.macVeilDark);
  const light = css.match(/prefers-color-scheme: light\) \{[^}]*\}/);
  assert.ok(light, '라이트 모양 베일 규칙');
  assert.equal(decl('--veil-a', light[0]), G.macVeilLight);
  assert.equal(decl('--veil-edge'), G.macVeilEdge);
  assert.equal(decl('--veil-feather'), G.macVeilFeather);
  // 단면 띠는 모두 두께 9px 안(inset + 두께 ≤ bevel)
  const bands = [...css.matchAll(/--in: ([\d.]+)px; --w: ([\d.]+)px;/g)];
  assert.equal(bands.length, 5, '어깨·안쪽 반사·안쪽 감쇠·분광 둘');
  for (const m of bands) assert.ok(Number(m[1]) + Number(m[2]) <= G.bevel, `단면 띠 ${m[0]}`);
  // 베일은 mac 전용(Windows Acrylic 은 그대로)
  assert.match(css, /\.veil \{ display: none; \}/);
  assert.match(css, /html\[data-platform="mac"\] \.veil \{\s*display: block;/);
  // 접근성: 투명도 줄이기·대비 높이기(html.opaque)와 강제 색에서 단면·베일을 끈다
  assert.match(css, /html\.opaque \.shade, html\.opaque \.veil, html\.opaque \.section, html\.opaque \.section-fine, html\.opaque \.prism \{ display: none; \}/);
  assert.match(css, /forced-colors: active\) \{\s*\.rim, \.mini-rim, \.shade, \.veil, \.wash, \.section, \.section-fine, \.prism \{ display: none; \}/);
  // 새 반복 애니메이션 없음 — 유리 층은 정적이다
  assert.equal((css.match(/@keyframes/g) || []).length, 2, 'petPulse·petMenuIn 두 개뿐');
});

test('캐릭터마다 얼굴·컷아웃 자산이 있고 120KB 이하다', () => {
  for (const c of C.CHARACTERS) {
    for (const f of [c.portrait, c.cutout]) {
      const p = path.join(DIR, '..', 'assets', f);
      assert.ok(fs.existsSync(p), `${f} 없음`);
      assert.ok(fs.statSync(p).size <= 120 * 1024, `${f} 크기`);
    }
  }
});

test('개발 트리에서 글꼴 두 번째 주소가 허브 원본을 가리킨다', () => {
  const css = read('fonts.css');
  for (const m of css.matchAll(/url\('(\.\.\/\.\.\/\.\.\/hub\/public\/fonts\/[^']+)'\)/g)) {
    assert.ok(fs.existsSync(path.join(DIR, m[1])), m[1]);
  }
  assert.match(css, /url\('\.\.\/fonts\/SUIT-Variable\.woff2'\)/, '패키징 주소가 먼저');
});
