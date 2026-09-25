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

// 콜드 로드마다 "먼저 정리할 것 0" 헤더가 본문 없이 떴다가 live+0건에서 Card째 사라졌다 —
// 그 원인이던 전용 섹션(CrmNudgeSection)은 2026-09-24 운영자 결정으로 걷혔다("넛지는 섹션이
// 아니라 대상에 붙는 제안 팁"). 이제 헤더 자체가 없으므로 빈 헤더 플래시도 구조적으로 없다 —
// 각 행은 자기 대상의 넛지가 있을 때만 SuggestionTip 한 줄을 붙인다.
test("넛지는 더 이상 전용 섹션이 아니라 행에 붙는 제안 팁이다 — 빈 헤더가 구조적으로 없다", () => {
  assert.doesNotMatch(nudge, /function CrmNudgeSection|function CrmNudgeCard/);
  assert.match(followups, /import \{ SuggestionTip \} from "\.\.\/suggestion-tip";/);
  assert.match(followups, /useCrmNudges\(\)/);
  assert.match(followups, /\{tip && \(/);
});
