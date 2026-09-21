import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// 2026-09-20: `inquiries-ledger.js`가 `deals.name`을 조회하고 있었다. 그 컬럼은 존재한 적이
// 없고(2026-04-20 foundation 스키마부터 `title`이다) PostgREST가 400 `42703`을 돌려줘서
// 문의 참조 라우트 전체가 `status:"error"`로 죽었다. 2026-09-13부터 그 상태였다.
//
// 기존 `inquiries-ledger.test.mjs`는 `deps.read`를 목으로 주입해 error 봉투 계약만 검증한다.
// 실제 컬럼명은 한 번도 타지 않으므로 이 종류의 오타를 영원히 못 잡는다. 이 파일은 소스에
// 적힌 (테이블, 라벨 컬럼) 쌍을 실제 스키마 정의와 대조한다 — DB 연결 없이 도는 정적 검사다.

const source = await readFile(new URL("./inquiries-ledger.js", import.meta.url), "utf8");

// 원장 스키마의 사실. `supabase/setup/00_live_schema.sql`과 운영 DB 실측(2026-09-20)이 근거다.
const LABEL_COLUMN = {
  leads: "name",
  deals: "title",
  operation_cases: "title",
  projects: "name",
  contacts: "name",
  companies: "name",
};

function pairsIn(text) {
  // `['deals', 'title']` 와 `['deal_id', 'deals', 'title', …]` 두 형태를 모두 읽는다.
  const out = [];
  for (const m of text.matchAll(/\[\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'(?:\s*,\s*'([a-z_]+)')?/g)) {
    const [, first, second, third] = m;
    if (LABEL_COLUMN[first]) out.push([first, second]);          // ['deals', 'title']
    else if (LABEL_COLUMN[second] && third) out.push([second, third]); // ['deal_id', 'deals', 'title', …]
  }
  return out;
}

test("문의 원장이 조회하는 라벨 컬럼이 실제 스키마와 일치한다", () => {
  const pairs = pairsIn(source);
  assert.ok(pairs.length >= 4, `테이블·컬럼 쌍을 찾지 못했다 — 정규식이 소스와 어긋났다 (찾은 수: ${pairs.length})`);

  const wrong = pairs
    .filter(([table, column]) => LABEL_COLUMN[table] !== column)
    .map(([table, column]) => `${table}.${column} (실제: ${table}.${LABEL_COLUMN[table]})`);

  assert.deepEqual(wrong, [], `존재하지 않는 컬럼을 조회한다 — PostgREST가 400 42703을 돌려주고 라우트가 error 봉투로 떨어진다:\n${wrong.join("\n")}`);
});

test("deals는 name이 아니라 title을 쓴다", () => {
  // 회귀 방지용 직접 고정 — 위 일반 검사가 정규식 드리프트로 조용히 0쌍을 볼 경우의 안전망.
  assert.ok(!/'deals',\s*'name'/.test(source), "deals의 라벨 컬럼은 title이다");
  assert.ok(/'deals',\s*'title'/.test(source), "deals.title 조회가 사라졌다");
});
