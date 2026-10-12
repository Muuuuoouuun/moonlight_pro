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
  // 보이는 후보는 화면 순서 그대로 받아 둔다 — '저장하고 다음'이 다음 사람을 고를 때만 쓴다(2026-09-30 ④).
  assert.match(page, /<RecordCandidates key=\{candidatesKey\} onRecord=\{onCandidateRecord\} onNavigate=\{onNavigate\} onVisible=\{setCandidates\} \/>/);
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
  // 저장한 자리는 줄에서 빠지고 되돌리면 돌아온다 — 고객 행과, 기록 후보에서 연 창이면 그 후보도(2026-09-30 ④).
  assert.match(page, /onSaved=\{\(_saved, t\) => markRecorded\(ctx, t, true\)\}/);
  assert.match(page, /onUndone=\{\(_id, t\) => markRecorded\(ctx, t, false\)\}/);
  assert.match(page, /const keys = \[t \? rowKey\(t\) : null, entry\?\.candidate \? candidateQueueKey\(entry\.candidate\.id\) : null\]\.filter\(Boolean\);\s*keys\.forEach\(\(key\) => markLeaving\(key, on\)\);/);
  // 확인 토스트는 서버 saved 뒤에만(onPersisted) — "기록 중"과 "기록됨"을 섞지 않는다. 창 머리의 '이전' 줄이
  // 이미 '저장됨 hh:mm'을 보였으면(shown) 토스트를 겹치지 않는다(다음 사람의 저장 줄을 가린다).
  assert.match(page, /onPersisted=\{\(_ids, t, receipt\) => \{ if \(!receipt\?\.shown\) toast\.success\(`기록됨 · \$\{t\?\.name \|\| "고객"\}`\); \}\}/);
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

// ── 2026-09-30 넓은 기록창 ④ — 같은 넓은 창 · 저장하고 다음(Q-CR2 · Q-CR8, 권장 · 화면 확인 뒤 확정) ──────────

test("기록 · e · N이 여는 창은 읽기 칸을 가진 넓은 기록창이다 — 약속은 이 화면이 아는 것, 기록은 그 칸이 읽는다", () => {
  assert.match(page, /import \{ RecordTargetContext \} from "\.\.\/record-target-context";/);
  const drawer = page.slice(page.indexOf("<ContactRecordDrawer"));
  // 읽기 칸 — 고객이 바뀌면 새로 세운다(앞 사람의 기록이 잠깐 남아 보이지 않게).
  assert.match(drawer, /context=\{\(t\) => \(\s*<RecordTargetContext\s*key=\{rowKey\(t\)\}\s*target=\{t\}\s*promise=\{promiseOf\(t\)\}/);
  assert.match(drawer, /promiseFor=\{promiseOf\}/);
  // 약속은 이 화면이 이미 읽은 목록에서 찾는다 — 목록에 없는 고객은 모른다(null)고 넘긴다. 날짜는 이 화면의
  // 기준(KST day-key)으로 접어 넘긴다: 행의 '지남'과 읽기 칸의 '지남'이 하루도 어긋나지 않는다.
  assert.match(page, /const rowsByKey = new Map\(\[\.\.\.items, \.\.\.upcoming, \.\.\.dormant\]\.map\(\(item\) => \[rowKey\(item\), item\]\)\);/);
  assert.match(page, /return item \? followupPromise\(item, \{ todayKey, promiseKey: kstDayKey\(item\.promisedAt\) \}\) : null;/);
  // 한 사람에 팁 하나 — 읽기 칸은 이 화면이 이미 고른 제안의 이유만 보인다.
  assert.match(drawer, /tipReason=\{nudgesBySubjectId\.has\(String\(t\.id\)\) \? nudgeTipReason\(nudgesBySubjectId\.get\(String\(t\.id\)\)\) : ""\}/);
  // 대상 없는 창(N)도 그대로 열린다 — 고객 고르기부터.
  assert.match(drawer, /searchTargets=\{searchContactTargets\}/);
  assert.match(page, /setRecordTarget\(\{ target: null, preset: \{\}, suggestions \}\);/);
  // 이 화면은 읽기 길을 새로 만들지 않는다 — 기록 읽기는 읽기 칸의 몫이다.
  assert.doesNotMatch(page, /api\/hub\/revenue\/activity/);
  // 확정된 배치는 그대로다 — 페이지 제목 하나, 레인 필터 없음, 행의 버튼 그대로.
  assert.equal(page.match(/<h2\b/g)?.length, 1);
  assert.match(page, /<Button variant=\{variant === "missed" \|\| variant === "today" \? "outline" : "ghost"\} size="sm" icon="edit" onClick=\{\(\) => onRecord\(item\)\}/);
});

test("행과 기록 후보에서 연 창만 줄에 자리가 있다 — 다음 사람은 화면 순서에서 고르고, 없으면 저장하고 닫는다", () => {
  assert.match(page, /import \{ buildRecordQueue, candidateQueueKey, candidateRecordTarget, followupPromise, nextRecordEntry \} from "@\/lib\/sales-os\/record-queue";/);
  // 줄 — 화면 순서(놓친 약속 → 기록할까요 → 오늘 약속 → 펼친 나머지). 접힌 줄은 펼쳤을 때만 선다.
  assert.match(page, /buildRecordQueue\(\{ missed, candidates, today, more: moreOpen \? more : null \}\)/);
  // 방금 기록해 빠지는 자리(leaving)와 이 창에서 이미 기록한 자리(recordedRun)는 건너뛴다. 줄에 자리가 없는 창
  // (직접 고른 고객)은 다음이 없다. 지금 쓰는 고객의 행도 건너뛴다 — 기록 후보에서 연 창을 저장하면 그 고객의 행도
  // 함께 빠진다(같은 사람을 다시 열지 않는다). 규칙은 순수 함수(nextRecordEntry — record-queue.test.mjs가 돌려 본다).
  assert.match(page, /const nextAfter = \(entry, t\) => nextRecordEntry\(recordQueue, entry, \{ leaving, done: recordedRun, target: t \}\);/);
  // 이 창에서 기록한 자리 — 저장하면 적고 되돌리기 · 실패면 지운다(markRecorded). 창이 닫히면 비운다.
  assert.match(page, /const \[recordedRun, setRecordedRun\] = React\.useState\(\(\) => new Set\(\)\);/);
  assert.match(page, /setRecordedRun\(\(prev\) => \{\s*const next = new Set\(prev\);\s*keys\.forEach\(\(key\) => \(on \? next\.add\(key\) : next\.delete\(key\)\)\);\s*return next;\s*\}\);/);
  assert.match(page, /onClose=\{\(\) => \{\s*setRecordTarget\(null\);\s*setRecordedRun\(new Set\(\)\);\s*\}\}/);
  // 자리는 연 곳이 정한다: 행 · 행에 붙은 제안 팁 · 기록 후보.
  assert.match(page, /target: targetOf\(item\),\s*preset,\s*queueKey: rowKey\(item\),/);
  assert.match(page, /queueKey: rowKey\(\{ kind: nudge\.subject\.type, id: nudge\.subject\.id \}\),/);
  assert.match(page, /candidate,\s*queueKey: candidateQueueKey\(candidate\?\.id\),/);
  const blank = page.slice(page.indexOf("const openBlank"), page.indexOf("const openRecordFor"));
  assert.doesNotMatch(blank, /queueKey/, "N으로 연 빈 창은 줄에 서지 않는다 — '저장' 하나다");
  const drawer = page.slice(page.indexOf("<ContactRecordDrawer"));
  // 줄이 말하는 '다음'은 창이 지금 쓰는 고객(t — 고객과 맞지 않은 후보에서 직접 고른 고객일 수 있다)으로 묻는다:
  // 쓰고 있는 사람을 '다음'이라고 부르지 않는다.
  assert.match(drawer, /next=\{\(t\) => \{\s*const upcomingEntry = nextAfter\(ctx, t\);\s*return upcomingEntry \? \{ name: upcomingEntry\.name \} : null;\s*\}\}/);
  // 다음 사람의 창은 그 행 · 그 후보를 누른 것과 같은 길로 연다(같은 프리셋 · 같은 부제) — 같은 규칙으로 고른다.
  // 넘길 곳이 없으면 이 화면이 창을 걷지 않는다(false): 창이 스스로 닫아야 방금 보낸 기록의 되돌리기가 토스트로 넘어간다.
  assert.match(drawer, /onAdvance=\{\(t\) => \{\s*const upcomingEntry = nextAfter\(ctx, t\);[\s\S]*?if \(!upcomingEntry\) return false;\s*openQueueEntry\(upcomingEntry\);\s*return true;\s*\}\}/);
  const advance = drawer.slice(drawer.indexOf("onAdvance={"), drawer.indexOf("onReturn={"));
  assert.doesNotMatch(advance, /setRecordTarget\(null\)/);
  // 기록 후보의 기록은 그 고객의 행과 초안 자리가 다르다 — 같은 고객의 두 기록이 서로의 글을 덮지 않는다.
  assert.match(drawer, /draftScope=\{ctx\.candidate \? candidateQueueKey\(ctx\.candidate\.id\) : ""\}/);
  // 기록 후보의 대상은 그 후보가 아는 회사를 든다(candidateRecordTarget) — 읽기 칸이 회사 우선으로 읽는다.
  assert.match(page, /const target = candidateRecordTarget\(candidate\);/);
  assert.doesNotMatch(page, /companyId: null/);
  assert.match(page, /const openQueueEntry = \(queued\) => \(queued\.candidate \? onCandidateRecord\(queued\.candidate\) : openRecordFor\(queued\.item, queued\.variant\)\);/);
  // '저장하고 다음' 글자는 이 화면이 쓰지 않는다 — 기록창(공용)이 다음 사람을 받았을 때만 말한다.
  assert.doesNotMatch(page.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, ""), /저장하고 다음|저장만/);
});

test("늦은 실패 — 창 머리가 말했으면 토스트를 겹치지 않고, 돌아가면 쓰던 글과 원인이 그대로 온다", () => {
  const drawer = page.slice(page.indexOf("<ContactRecordDrawer"));
  const failed = drawer.slice(drawer.indexOf("onFailed={"), drawer.indexOf("onClose={"));
  // 어느 경우든 그 사람은 줄로 돌아온다(기록되지 않았다).
  assert.match(failed, /onFailed=\{\(\{ message, form, target: t \}, receipt\) => \{\s*markRecorded\(ctx, t, false\);\s*if \(receipt\?\.shown\) return;/);
  // 창이 닫혀 있었으면 지금처럼 — 원인을 알리고 같은 고객 기록창을 입력 그대로 다시 연다.
  assert.match(failed, /toast\.error\(`기록하지 못했습니다 · \$\{t\?\.name \|\| "고객"\} — \$\{message\}`\);/);
  assert.match(failed, /setRecordTarget\(\(cur\) => cur \|\| \{ \.\.\.ctx, target: t \|\| ctx\.target, draft: form, error: message \}\);/);
  // 머리 줄의 '돌아가기' — 그 창을 열었던 맥락 그대로, 저장하지 못한 글(draft)과 원인(error)을 들고.
  assert.match(drawer, /onReturn=\{\(entry, \{ target: t, draft, error \} = \{\}\) => setRecordTarget\(\{ \.\.\.\(entry \|\| \{\}\), target: t \|\| entry\?\.target \|\| null, draft: draft \|\| null, error: error \|\| "" \}\)\}/);
  // 기록 후보는 요약이 저장된 뒤에만 정리한다 — 저장하고 다음으로 넘어간 뒤에도 같다(연 순간의 ctx를 붙든다).
  assert.match(drawer, /onSummaryPersisted=\{\(_ids, t\) => \{\s*if \(ctx\.candidate\) resolveCandidate\(ctx\.candidate\);\s*reload\(\)\.then\(\(\) => markLeaving\(t \? rowKey\(t\) : null, false\)\);/);
});
