import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

// CLAUDE.md 코드 규칙: "Supabase 없는 환경은 명시적 preview/empty state로 표시하고 mock과
// live 데이터를 섞지 않음". 2026-09-19 운영자가 2.0 실사용을 시작하면서 이 규칙을 강제
// 장치로 고정한다 — 더미 데이터는 로컬 전용 Supabase 프로젝트(개발 DB)에만 존재하고
// 코드에는 절대 들어오지 않는다. 그래야 "로컬에서만 보이고 배포에서는 안 보인다"가
// 런타임 분기가 아니라 구조적으로 보장된다.
//
// 감사 시점(2026-09-19) 저장소는 이미 깨끗했다. 이 테스트는 그 상태를 고정한다.
// 잡는 것:
//   1) MOCK_/DEMO_/SAMPLE_/DUMMY_/FAKE_/FIXTURE 계열 식별자 선언
//   2) 업무 레코드처럼 생긴 객체 배열 리터럴 (이름·이메일·전화·금액·단계 같은 키 2개 이상)
// 잡지 않는 것:
//   - 주석과 문자열 안의 단어 (설명은 자유롭게 쓴다)
//   - key/label/value/icon 류만 가진 UI 옵션 목록 (필터·탭·톤 정의는 데이터가 아니다)
//   - *.test.mjs 와 빌드 산출물

const ROOTS = ["apps/hub", "apps/engine", "packages"];
const SKIP_DIR = /^(node_modules|\.next.*|dist|build|coverage|\.turbo)$/;

async function collect(dir, rel, acc) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    if (SKIP_DIR.test(entry.name)) continue;
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) await collect(new URL(`${entry.name}/`, dir), childRel, acc);
    else if (/\.(jsx?|mjs|tsx?)$/.test(entry.name) && !/\.test\.(mjs|js|jsx)$/.test(entry.name)) {
      acc.push([childRel, await readFile(new URL(entry.name, dir), "utf8")]);
    }
  }
  return acc;
}

const sources = [];
for (const root of ROOTS) await collect(new URL(`../${root}/`, import.meta.url), root, sources);

// 주석과 문자열 리터럴을 공백으로 지워 "설명"과 "코드"를 가른다.
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => " ".repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => " ".repeat(m.length));
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

// ── 규칙 1 · 목업 이름의 식별자 선언 ────────────────────────────────────────
const MOCK_DECL = /\b(?:const|let|var|function|class)\s+(MOCK[_A-Z0-9]*|DEMO[_A-Z0-9]*|SAMPLE[_A-Z0-9]*|DUMMY[_A-Z0-9]*|FAKE[_A-Z0-9]*|mock[A-Z]\w*|demo[A-Z]\w*|dummy[A-Z]\w*|fake[A-Z]\w*|fixtures?)\b/g;

test("배포 코드에 목업 이름의 식별자가 없다", () => {
  const offenders = [];
  for (const [path, src] of sources) {
    const code = stripNonCode(src);
    for (const m of code.matchAll(MOCK_DECL)) offenders.push(`${path}:${lineOf(src, m.index)} → ${m[1]}`);
  }
  assert.deepEqual(offenders, [], `목업 식별자는 로컬 개발 DB로 옮겨라:\n${offenders.join("\n")}`);
});

// ── 규칙 2 · 업무 레코드처럼 생긴 하드코딩 배열 ─────────────────────────────
// UI 옵션 목록(key/label/value/icon…)은 데이터가 아니다. 사람·돈·일정이 붙으면 데이터다.
const RECORD_KEYS = new Set([
  "name", "fullName", "email", "phone", "mobile", "company", "customer", "client",
  "amount", "revenue", "price", "budget", "stage", "owner", "assignee", "dueDate",
  "due", "lastContact", "contactedAt", "avatar", "position", "region", "subject",
]);
const OPTION_KEYS = new Set(["key", "label", "value", "icon", "kind", "tone", "id", "title", "desc", "hint", "path", "keywords"]);

// `= [` 부터 대응하는 `]` 까지 잘라낸다. 문자열·주석은 이미 공백이라 괄호 균형이 안전하다.
function arrayLiterals(code) {
  const out = [];
  for (const m of code.matchAll(/=\s*\[/g)) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (c === "[" || c === "{" || c === "(") depth += 1;
      else if (c === "]" || c === "}" || c === ")") { depth -= 1; if (depth === 0) break; }
    }
    if (depth === 0 && i - m.index < 20000) out.push([m.index, code.slice(m.index, i + 1)]);
  }
  return out;
}

test("배포 코드에 업무 레코드처럼 생긴 하드코딩 배열이 없다", () => {
  const offenders = [];
  for (const [path, src] of sources) {
    const code = stripNonCode(src);
    for (const [at, literal] of arrayLiterals(code)) {
      if (!literal.includes("{")) continue;
      for (const obj of literal.matchAll(/\{([^{}]*)\}/g)) {
        const keys = [...obj[1].matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g)].map((k) => k[1]);
        if (!keys.length) continue;
        const recordHits = keys.filter((k) => RECORD_KEYS.has(k));
        // 옵션 목록 키만으로 이루어졌으면 통과. 레코드 키가 2개 이상일 때만 잡는다.
        if (recordHits.length < 2) continue;
        if (keys.every((k) => OPTION_KEYS.has(k) || !RECORD_KEYS.has(k))) continue;
        offenders.push(`${path}:${lineOf(src, at)} → {${recordHits.join(", ")}}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `실데이터는 Supabase에서 온다. 하드코딩 레코드를 지워라:\n${offenders.join("\n")}`);
});
