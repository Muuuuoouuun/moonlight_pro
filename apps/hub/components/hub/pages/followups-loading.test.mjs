import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const followups = await readFile(new URL("./followups.jsx", import.meta.url), "utf8");
const nudge = await readFile(new URL("../crm-nudge.jsx", import.meta.url), "utf8");

// §11: 로딩은 EmptyState("비어 있음")가 아니라 Skeleton이다. `useFollowups`의 초기 상태와
// 캐시 미스 재로드가 모두 syncState:"loading"이라, 콜드 로딩 순간 운영자는 preview 문구
// "연락 데이터 없음 / Supabase가 연결되면 표시됩니다"를 봤다 — §5.3 truth 혼동이기도 하다.
test("오늘 연락 목록의 콜드 로딩은 Skeleton으로 그린다", () => {
  assert.match(followups, /syncState === "loading" && items\.length === 0 \?[\s\S]{0,400}<Skeleton/);
  // preview 문구는 loading 분기 뒤에 남아야 한다 — 두 상태가 같은 카피를 쓰면 안 된다.
  assert.match(followups, /"연락 데이터 없음"/);
  const loadingAt = followups.indexOf('syncState === "loading" && items.length === 0 ?');
  assert.ok(loadingAt >= 0 && loadingAt < followups.indexOf('"연락 데이터 없음"'));
});

// 허브 read 계약(CLAUDE.md): 실패도 HTTP 200 + status:"error"다. !r.ok만 보면 읽기 실패가
// "놓친 약속 0"으로 위장된다 — 후속 누락 0건 목표에서 가장 위험한 오독.
test("오늘 연락은 read 실패 봉투를 읽고 오류를 빈 목록과 따로 그린다", () => {
  assert.match(followups, /if \(!r\.ok \|\| !d \|\| d\.status === "error"\)/);
  assert.match(followups, /syncState === "error" \? \(/);
  assert.match(followups, /title="연락 목록을 읽지 못했습니다"/);
  // 레일도 같다 — 주간 읽기 실패(week null)는 "연락 0"이 아니다.
  assert.match(followups, /이번 주 기록을 읽지 못했어요/);
});

// 콜드 로드마다 "먼저 정리할 것 0" 헤더가 본문 없이 떴다가 live+0건에서 Card째 사라졌다.
// (2026-09-24부터 오늘 연락은 넛지 섹션을 싣지 않는다 — 계약은 넛지 컴포넌트 자체에 남는다.)
test("넛지 섹션은 로딩 중 빈 헤더를 그리지 않는다", () => {
  assert.match(nudge, /if \(nudges\.length === 0 && \(state === "live" \|\| state === "loading"\)\) return null;/);
});
