import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// 오늘 연락(2026-09-24 운영자 승인 목업 01) — 영업·매출 첫 탭의 화면 계약.
const page = await readFile(new URL("./followups.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./today-contact.css", import.meta.url), "utf8");

test("Futura 텍스처: 섹션 eyebrow 날짜 + 44px 제목 + fx-card 레일", () => {
  assert.match(page, /className="hub-futura hub-page fade-up today-contact"/);
  assert.match(page, /<header className="fx-head today-contact__head">/);
  assert.match(page, /\{headerDate\(\)\} · 오늘 연락/);
  assert.match(page, /<h2 className="fx-page-title today-contact__title">/);
  // 페이지 제목은 정확히 하나(§11).
  assert.equal(page.match(/<h2\b/g)?.length, 1);
  assert.match(page, /className="fx-card today-contact__card"/);
});

test("제목의 N명은 놓친·오늘 약속의 사람 수이고, 빨강은 놓친 약속 건수에만 붙는다", () => {
  assert.match(page, /const peopleCount = new Set\(\[\.\.\.missedLive, \.\.\.todayLive\]\.map\(rowKey\)\)\.size;/);
  assert.match(page, /오늘 챙길 사람 <span className="stat">\{peopleCount\}<\/span>명/);
  assert.match(page, /missedLive\.length > 0 \? "today-contact__missed num" : "num"/);
  // 오늘 약속·다가오는 약속·기약 없음은 빨강이 아니다(§5.2 no warning-by-default).
  assert.match(css, /\.today-contact__missed \{ color: var\(--danger\)/);
  assert.equal(css.match(/var\(--danger\)/g)?.length, 4, "danger lives only on missed count, section count, late label, reschedule error");
});

test("기록할까요는 공용 후보 컴포넌트를 그대로 싣고, 저장되면 그 후보를 정리한다", () => {
  assert.match(page, /import \{ RecordCandidates, resolveRecordCandidate \} from "\.\.\/record-candidates";/);
  assert.match(page, /<RecordCandidates key=\{candidatesKey\} onRecord=\{onCandidateRecord\} onNavigate=\{onNavigate\} \/>/);
  // 요약 RPC가 saved로 답한 뒤에만 정리한다 — 되돌리거나 실패한 기록으로 후보를 지우지 않는다.
  assert.match(page, /onSummaryPersisted=\{\(_ids, t\) => \{\s*if \(ctx\.candidate\) resolveCandidate\(ctx\.candidate\);/);
  assert.match(page, /res = await resolveRecordCandidate\(candidate\.id\);/);
  // 후보의 채널·시각·통화 길이·요약이 시트 프리셋으로 넘어간다.
  for (const key of ["kind: CANDIDATE_CHANNEL", "summary: String(candidate?.text", "occurredAt: candidate?.occurredAt", "durationSec: candidate?.durationSec", "candidateId: candidate?.id"]) {
    assert.ok(page.includes(key), key);
  }
});

test("이름은 고객으로 간다 — 리드는 고객 탭, 거래는 거래 탭(ledger href)", () => {
  assert.match(page, /onClick=\{\(\) => onNavigate\?\.\(item\.href\)\}/);
  // 헤더의 옛 '고객 DB' 버튼과 레인 필터는 탭 줄·행 라벨이 대신한다.
  assert.doesNotMatch(page, /고객 DB/);
  assert.doesNotMatch(page, /LANE_OPTIONS|SegmentedControl/);
});

test("검색은 고객 탭으로 넘기고, / 로 포커스되며, N은 빈 기록 시트를 연다", () => {
  assert.match(page, /onNavigate\?\.\(`dashboard\/revenue\/customers\?q=\$\{encodeURIComponent\(q\)\}`\)/);
  assert.match(page, /onSearchFocus: \(\) => searchRef\.current\?\.focus\(\)/);
  assert.match(page, /onNew: openBlank/);
  assert.match(page, /연락 기록 <Kbd>N<\/Kbd>/);
  // 빈 시트는 고객 고르기부터 — 대상 없는 ContactRecordDrawer는 searchTargets가 있어야 열린다.
  assert.match(page, /searchTargets=\{searchContactTargets\}/);
  assert.match(page, /\/api\/hub\/followups\/targets\?q=/);
});

test("30초 기록 시트는 토스트 되돌리기로 닫히고, 저장한 행은 --dur-panel로 접히며 빠진다", () => {
  assert.match(page, /undoMode="toast"/);
  assert.match(page, /onSaved=\{\(_saved, t\) => markLeaving\(t \? rowKey\(t\) : null, true\)\}/);
  assert.match(page, /onUndone=\{\(_id, t\) => markLeaving\(t \? rowKey\(t\) : null, false\)\}/);
  // 확인 토스트는 서버 saved 뒤에만(onPersisted) — "기록 중"과 "기록됨"을 섞지 않는다.
  assert.match(page, /onPersisted=\{\(_ids, t\) => toast\.success\(`기록됨 · \$\{t\?\.name \|\| "고객"\}`\)\}/);
  assert.match(css, /\[data-leaving="true"\] \{[^}]*grid-template-rows: 0fr;[^}]*visibility: hidden;/);
  assert.match(css, /grid-template-rows var\(--dur-panel\) var\(--ease-hub\)/);
});

test("날짜 다시 · 시점 정하기는 연락 기록 없이 약속 날짜만 옮기고, preview를 성공으로 말하지 않는다", () => {
  assert.match(page, /body: JSON\.stringify\(\{ action: "reschedule", kind: item\.kind, id: item\.id, at \}\)/);
  assert.match(page, /if \(d\?\.status === "saved"\) \{/);
  assert.match(page, /"Preview · 연결 필요 — 저장되지 않았어요\."/);
  assert.match(page, /<DateQuickPresets onPick=\{onPick\}/);
});

test("다가오는 약속에 기록하면 그 약속을 이어 쓴다 — 빈 칸으로 열어 약속을 지우지 않는다", () => {
  assert.match(page, /if \(variant === "upcoming" && item\.promisedAt\) \{\s*preset\.followup = "dated";\s*preset\.at = kstDayKey\(item\.promisedAt\);/);
});

test("접힌 줄은 다가오는 약속 · 기약 없음이고, 기약 없음 30일은 '다시 볼까요?'", () => {
  assert.match(page, /<details className="today-contact__more" open=\{moreOpen\}/);
  assert.match(page, /다가오는 약속 <b className="num">\{more\.upcoming\.length\}<\/b>/);
  assert.match(page, /기약 없음 <b className="num">\{more\.dormant\.length\}<\/b>/);
  assert.match(page, /\$\{item\.dormantDays\}일 지남 — 다시 볼까요\?/);
  assert.match(page, /variant === "dormant" && item\.recheck \?/);
});

test("오른쪽 레일은 기록에서 센 숫자뿐이다 — 측정 전이면 '측정 전'", () => {
  assert.match(page, /week\?\.recordSeconds \? `\$\{week\.recordSeconds\.average\}초` : "측정 전"/);
  assert.match(page, /\{missedCount\}건 → 목표 0/);
  assert.match(page, /role="img"\s+aria-label=\{`요일별 연락 수 · /);
  // 목업의 예시 숫자(12·7·24초 등)를 코드에 두지 않는다.
  assert.doesNotMatch(page, /24초|김지현|한빛수학|이수진/);
});

test("모바일: 레일은 목록 아래, 행 버튼은 전폭, 검색·기록 버튼도 전폭", () => {
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.hub-app \.today-contact__grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /\.today-contact__acts \{ grid-column: 1 \/ -1;/);
  assert.match(mobile, /\.today-contact__acts > \.hub-btn \{ flex: 1 1 0; \}/);
  assert.match(mobile, /\.today-contact__cta \{ width: 100%; min-width: 0; \}/);
});

test("모션은 토큰만, 보더는 1px", () => {
  assert.doesNotMatch(css, /\d+ms|cubic-bezier\(/);
  assert.doesNotMatch(css, /(?:border|border-top)[^;]*\b(?:[2-9]|\d{2,})px/);
});

test("고객 고르기 읽기 라우트도 허브 read 봉투(HTTP 200 + status:error)를 따른다", async () => {
  const route = await readFile(new URL("../../../app/api/hub/followups/targets/route.js", import.meta.url), "utf8");
  assert.match(route, /if \(data\.source === "error"\) \{\s*return NextResponse\.json\(\{ status: "error", \.\.\.data \}\);/);
  assert.doesNotMatch(route, /status: 5\d\d/);
  const main = await readFile(new URL("../../../app/api/hub/followups/route.js", import.meta.url), "utf8");
  // 쓰기 두 가지는 write guard 뒤에서만 — 읽기(GET)는 그대로.
  assert.ok(main.indexOf("assertHubWriteAllowed(req)") < main.indexOf('action === "reschedule"'));
  assert.match(main, /if \(status === "preview" \|\| status === "noop"\) return 202;/);
});

test("화면 전용 보조 읽기 실패도 화면에서는 partial로 명명된다", async () => {
  const main = await readFile(new URL("../../../app/api/hub/followups/route.js", import.meta.url), "utf8");
  assert.match(main, /const partial = data\.partial \|\| \(data\.auxiliaryFailedSources \|\| \[\]\)\.length > 0;/);
  assert.match(page, /d\.auxiliaryFailedSources/);
});
