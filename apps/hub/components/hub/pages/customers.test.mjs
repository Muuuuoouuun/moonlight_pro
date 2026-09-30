import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const customersSource = readFileSync(new URL("./customers.jsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./customer-focus.css", import.meta.url), "utf8");

const slice = (from, to) => {
  const start = customersSource.indexOf(from);
  assert.ok(start >= 0, `${from} must stay findable`);
  const end = to ? customersSource.indexOf(to, start + from.length) : customersSource.length;
  return customersSource.slice(start, end > start ? end : undefined);
};

// ── 목록 (2026-09-24 목업 02) ────────────────────────────────────────────────

test("the page wears the approved Futura texture with a search-first hero", () => {
  assert.match(customersSource, /className="hub-futura hub-page fade-up customers-page"/);
  assert.match(customersSource, /<h2 className="fx-page-title">누구를 찾으세요\?<\/h2>/);
  assert.match(customersSource, /className="fx-eyebrow customers-hero__eyebrow"/);
  assert.match(customersSource, /약속 없는 진행 중 <span className="num">\{openWithoutPromise\}<\/span>/);
  assert.match(customersSource, /<Button variant="primary" size="md" icon="plus" onClick=\{\(\) => openNewCustomer\(\)\}>고객 <Kbd>N<\/Kbd><\/Button>/);
  // 검색이 가장 크다 — 56px pill, 모바일 입력 16px 플로어.
  assert.match(cssSource, /\.customers-search \{[^}]*height: 56px/);
  assert.match(cssSource, /@media \(max-width: 600px\)[\s\S]*\.customers-search input \{ font-size: 16px; \}/);
});

test("segments come from the shared list model and default to 진행 중", () => {
  assert.match(customersSource, /React\.useState\(DEFAULT_CUSTOMER_SEGMENT\)/);
  assert.match(customersSource, /options=\{CUSTOMER_SEGMENTS\.map\(s => \(\{ key: s\.key, label: s\.label, count: counts\[s\.key\] \}\)\)\}/);
  // 옛 세그먼트(⭐ 중요 고객 · 확인 필요)는 접힌 필터의 보조 조건으로 남는다.
  assert.match(customersSource, /<SelectField label="표시" value=\{focusFilter\}[\s\S]*?options=\{CUSTOMER_FOCUS_FILTERS\}/);
  assert.match(customersSource, /aria-expanded=\{filtersOpen\}/);
  for (const label of ["과목", "지역", "장르", "유입"]) {
    assert.match(customersSource, new RegExp(`<SelectField label="${label}"`));
  }
});

test("typing searches everything, ?q= prefills it, and a miss offers clear + create", () => {
  assert.match(customersSource, /if \(!search\.trim\(\) && value\.trim\(\)\) setSegment\("all"\);/);
  assert.match(customersSource, /const q = searchParams\?\.get\("q"\);/);
  assert.match(customersSource, /if \(q\) \{ setSearch\(q\); setSegment\("all"\); consumed\.push\("q"\); \}/);
  assert.match(customersSource, /title=\{`'\$\{term\}'에 맞는 고객이 없어요`\}/);
  assert.match(customersSource, />검색 지우기<\/Button>/);
  assert.match(customersSource, /onClick=\{\(\) => openNewCustomer\(term\)\}>'\{term\}' 새 고객으로<\/Button>/);
});

test("deep links are consumed once and keep ?scope=", () => {
  assert.match(customersSource, /const target = searchParams\?\.get\("customer"\);/);
  assert.match(customersSource, /stripParams\(\["customer"\]\)/);
  assert.match(customersSource, /consumedParamsRef\.current\.forEach\(\(key\) => next\.delete\(key\)\);/);
  assert.match(customersSource, /wantsNew === "customer" \|\| wantsNew === "lead"/);
  assert.match(customersSource, /scopeKey === "classin"[\s\S]*filterLeadsByWorkspace\(ledger\.leads, "classin"\)/);
});

test("the table has exactly five 3-state sortable columns, recent customer activity by default", () => {
  const head = slice('className="customers-grid customers-head"', "</div>");
  const heads = [...head.matchAll(/<SortHead k="(\w+)"[^>]*>([^<]+)<\/SortHead>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(heads, [["name", "고객"], ["phase", "단계"], ["promise", "다음 약속"], ["last", "마지막 연락"], ["value", "금액"]]);
  assert.match(customersSource, /React\.useState\(\{ key: "recent", dir: "desc" \}\)/);
  assert.match(customersSource, /if \(prev\.dir === "asc"\) return \{ key, dir: "desc" \};\s*return \{ key: null, dir: "asc" \};/);
  assert.match(customersSource, /정렬: \{sortCaption\(sort\)\}/);
  assert.match(cssSource, /grid-template-columns: minmax\(0, 1\.5fr\) minmax\(96px, 0\.7fr\) minmax\(0, 1\.4fr\) minmax\(0, 1fr\) 96px;/);
});

test("overdue promises get a budgeted 1px danger rail and a direct label, never a fill", () => {
  assert.match(customersSource, /const MAX_DANGER_RAILS = 3;/);
  assert.match(customersSource, /data-urgent=\{rail \? "true" : undefined\}/);
  assert.match(cssSource, /\.customers-row\[data-urgent="true"\] \{ box-shadow: inset 1px 0 0 var\(--danger\); \}/);
  assert.doesNotMatch(cssSource, /inset [2-9]px 0 0/);
  assert.doesNotMatch(cssSource, /background:\s*var\(--danger/);
  // 단계는 중립 lifecycle 배지 — 색으로 분류하지 않는다.
  assert.match(customersSource, /<LifecycleBadge state=\{phase\.lifecycle\} label=\{phase\.label\} \/>/);
});

test("rows are keyboard-reachable buttons with CSS hover and arrow/Enter navigation", () => {
  const row = slice("function CustomerRow", "// 읽기 실패는");
  assert.match(row, /className="hub-row customers-grid customers-row"/);
  assert.match(row, /role="button"/);
  assert.match(row, /tabIndex=\{0\}/);
  assert.match(row, /if \(e\.key === "Enter" \|\| e\.key === " "\)/);
  assert.doesNotMatch(customersSource, /onMouseEnter|onMouseLeave/);
  assert.match(customersSource, /e\.key !== "ArrowDown" && e\.key !== "ArrowUp" && e\.key !== "Enter"/);
  assert.match(customersSource, /onSearchFocus: \(\) => searchRef\.current\?\.focus\(\)/);
});

test("a failed read is an error with a retry, never an empty list; loading is a skeleton", () => {
  const readError = slice("function CustomersReadError", "// ── 페이지");
  assert.match(readError, /<TruthBadge state="error"/);
  assert.match(readError, /다시 읽기/);
  assert.doesNotMatch(readError, /EmptyState/);
  assert.match(customersSource, /syncState === "error" && ledgerRows\.length === 0\) \{\s*body = <CustomersReadError onRetry=\{reloadLedger\} \/>/);
  assert.match(customersSource, /<Skeleton lines=\{6\} height=\{22\}/);
  assert.match(customersSource, /예시 고객은 만들지 않습니다/);
});

test("the 10px fold button is gone — every drawer control respects the font floor", () => {
  // 보조 메타 플로어 10.5px — 그 아래(10px·9.x)는 어디에도 없다(§8.1).
  assert.doesNotMatch(customersSource, /fontSize: (?:\d|10)(?:\.[0-4]\d*)?[,\s}]/);
  assert.doesNotMatch(cssSource, /font-size: (?:\d|10)(?:\.[0-4]\d*)?px/);
});

// ── 드로어 ───────────────────────────────────────────────────────────────────

test("the drawer reads promise → record → deal → info, with one primary action", () => {
  const drawer = slice("function Customer360Drawer", "// ── 새 고객 등록");
  const order = ["<PromiseCard", 'aria-label="기록"', ">거래</h3>", ">정보</h3>", ">도움 받기</h3>"].map((mark) => drawer.indexOf(mark));
  order.forEach((index) => assert.ok(index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal((drawer.match(/variant="primary"/g) || []).length, 1);
  assert.match(drawer, /연락 기록 <Kbd>R<\/Kbd>/);
  assert.match(drawer, /if \(e\.key !== "r" && e\.key !== "R"\) return;/);
  assert.match(drawer, /presentation=\{mobile \? "compact" : "side"\}/);
});

test("quick contact actions render only when the record has the data", () => {
  const quick = slice("function QuickContactActions", "function Customer360Drawer");
  assert.match(quick, /if \(!row\.phone && !row\.email\)/);
  assert.match(quick, /row\.phone && <Button[\s\S]*?>전화<\/Button>/);
  assert.match(quick, /navigator\.clipboard\.writeText\(row\.phone\)/);
  assert.match(quick, /row\.email && <Button[\s\S]*?>메일<\/Button>/);
});

test("the promise card records or reschedules without faking a contact", () => {
  const card = slice("function PromiseCard", "// 전화·카톡·메일");
  assert.match(card, /했어요 · 기록/);
  assert.match(card, /날짜 다시/);
  assert.match(card, /약속 정하기/);
  // 약속을 읽는 말은 promiseReadout이 정한다 — 넓은 기록창의 읽기 칸과 같은 문장이다
  // (문장 자체는 customer-list.test.mjs가 고정).
  assert.match(card, /const \{ what, muted, late, lateLabel, when: whenText \} = promiseReadout\(promise\);/);
  assert.doesNotMatch(card, /아직 정하지 않았어요|종료된 고객|날짜를 아직 안 정했어요/, "문장을 카드 안에 다시 쓰지 않는다");
  assert.match(card, /data-late=\{late \? "true" : undefined\}/);
  // 날짜만 옮기는 쓰기는 연락 RPC가 아니라 update 라우트의 스네이크 키다(customer-promise.js).
  const save = slice("const savePromise = async", "// R — 연락 기록");
  assert.match(save, /patch\.next_action_at = at/);
  assert.match(save, /saveRevenueRecord\(row\.kind === "account" \? "account" : "lead", "update", patch\)/);
  assert.doesNotMatch(save, /contact-outcome/);
  // 저장이 확인된 뒤에만 알린다(Save envelope).
  assert.ok(save.indexOf("if (!result.ok)") < save.indexOf("toast.success"));
});

test("record mode swaps the same drawer to the shared capture form (one overlay)", () => {
  const drawer = slice("function Customer360Drawer", "// ── 새 고객 등록");
  assert.doesNotMatch(drawer, /<ContactRecordDrawer\b/);
  assert.match(drawer, /<ContactRecordForm[\s\S]*?aiContext=\{/);
  // 제목은 기록 모드를 따라간다 — 넓은 기록창의 메모 모드에서는 "메모"(2026-09-30 ⑥).
  assert.match(drawer, /title=\{record \? \(memoMode \? "메모" : "연락 기록"\) : displayName\}/);
  assert.match(drawer, /onClose=\{record \? \(\) => setRecord\(null\) : onClose\}/);
  // 그릇은 같은 Drawer다 — 폭만 순수 규칙(recordWindowLayout)에서 받고, 새 presentation은 없다(Q-CR1).
  // 화면 폭이 배치(나란히 · 탭 · 시트)를 고른다 — 두 미디어 쿼리의 답을 그대로 넘긴다(2026-09-30 ③).
  assert.match(drawer, /const mobile = useMediaQuery\(RECORD_LAYOUT_QUERIES\.sheet\);\s*const narrow = useMediaQuery\(RECORD_LAYOUT_QUERIES\.tabs\);/);
  assert.match(drawer, /const recordLayout = recordWindowLayout\(\{ recording: Boolean\(record\), mobile, narrow \}\);/);
  assert.match(drawer, /presentation=\{mobile \? "compact" : "side"\}\s*width=\{recordLayout\.width\}/);
  assert.doesNotMatch(drawer, /presentation="(focus|wide|sheet|full)"/);
  // 휴대폰의 전체 높이와 머리 저장도 같은 Drawer의 선택 prop이다 — 새 오버레이가 아니다(Q-CR11).
  assert.match(drawer, /sheet=\{recordLayout\.headerSave \? "full" : "auto"\}/);
  assert.match(drawer, /headerAction=\{recordLayout\.headerSave \? <span ref=\{setSaveSlot\} className="record-window__save-slot" \/> : null\}/);
  assert.equal((drawer.match(/<Drawer\b/g) || []).length, 1, "고객 드로어는 Drawer 하나다");
  // 기록 모드를 떠나면 포커스를 같은 드로어의 '연락 기록' 버튼으로 돌려놓는다(문서 밖으로 떨어지지 않게).
  assert.match(drawer, /if \(wasRecordingRef\.current && !record\) recordButtonRef\.current\?\.focus\(\);/);
  assert.match(drawer, /<Button ref=\{recordButtonRef\} variant="primary"/);
  // 늦은 실패는 폼이 사라졌어도 부모가 입력 그대로 다시 연다.
  assert.match(customersSource, /setRecordRequest\(\{ key: row\.key, draft: form, error: message \}\)/);
});

test("a persisted contact replaces its optimistic timeline ID so delete reaches the saved row", () => {
  const form = customersSource.slice(customersSource.indexOf("<ContactRecordForm"));
  assert.match(form, /onSummaryPersisted=\{\(\{\s*activityId,\s*optimisticId\s*\}\)/);
  // 서버 ID로 바꾸면서 "기록 중"도 푼다 — ID를 못 받았으면 낙관 ID를 둔 채 다시 읽는다.
  assert.match(form, /a\.id === optimisticId \? \{ \.\.\.a, id: activityId \|\| a\.id, pending: false \} : a/);
  assert.match(form, /if \(!activityId\) reload\(\);/);
});

test("the record stream merges activities with linked memos and keeps local rows undeletable", () => {
  const timeline = slice("function ActivityTimeline", "// 빠른 기록");
  assert.match(timeline, /onDeleteActivity && a\.id && !String\(a\.id\)\.startsWith\("local-"\)/);
  assert.match(customersSource, /useMemoSearch\(memoQuery, \{ enabled: memoEnabled \}\)/);
  assert.match(customersSource, /\[\.\.\.acts, \.\.\.notes\]\.sort/);
});

test("ActivityTimeline deletion keeps its undo window", () => {
  assert.match(customersSource, /onDeleteActivity=\{deleteActivity\}/);
  assert.match(customersSource, /saveRevenueRecord\("activity", "delete", \{ id: activity\.id \}\)/);
  assert.match(customersSource, /cust-act-delete-/);
  assert.match(customersSource, /actNotice && \(/);
});

test("Customer360Drawer keeps the 1-click VIP toggle and the 3-step focus control", () => {
  assert.match(customersSource, /onFocusChange\?\.\(row\.key, next\)/);
  assert.match(customersSource, /\{focusOverride === "raise" \? "⭐ 중요 고객" : "중요 고객 지정"\}/);
  assert.match(customersSource, /\{ key: "raise", label: "올리기 \(중요\)" \}/);
  // 목록에서는 표시만(★ 글리프 + 이름), 좌측 레일은 긴급 전용이라 쓰지 않는다(§5.3).
  assert.match(customersSource, /row\.focusOverride === "raise" && <span className="customers-who__star" role="img" aria-label="중요 고객">/);
  assert.doesNotMatch(customersSource, /inset 1px 0 0 var\(--moon-300\)/);
});

test("Customer360Drawer asks Guru through the source-card question drawer, never the deal-review widget", () => {
  assert.match(customersSource, /<GuruGuidanceCard domain="sales" compact onAsk=/);
  assert.match(customersSource, /<GuidanceQuestionDrawer card=\{guruCard\}/);
  assert.doesNotMatch(customersSource, /Guru 전략 코칭 \(⌘J\)/);
  // 2026-09-25: 위젯의 대화는 deal-review로 보내져 레코드와 무관한 거래 초점을 찾았고, 매 턴
  // Engine이 project_updates 행을 남겼다. 고객 상세는 open-question 질문 경로만 쓴다.
  assert.doesNotMatch(customersSource, /FloatingMentorWidget|deal-review|initialQuestion=/);
});

test("customer help has one scope-aware reply draft and no unscoped sales persona generator", () => {
  assert.match(customersSource, /<OfficeWorkflowPanel/);
  assert.doesNotMatch(customersSource, /CustomerOutreachDrafter|requestPersonaChat|outreach-draft/);
});

test("contact record form provides AI Smart Autofill from conversation or call notes, and the customer detail enables it", () => {
  // CRM 시트 전역화(6530533)로 컨택 완료 시트가 공용 ContactRecordForm으로 옮겨 갔다 — AI 채우기도 함께 이동.
  const formSource = readFileSync(new URL("../contact-record-form.jsx", import.meta.url), "utf8");
  assert.match(formSource, /대화·메모에서 폼 자동 채우기/);
  assert.doesNotMatch(formSource, /✨/);
  assert.match(formSource, /parseContactOutcomeExtraction/);
  assert.match(formSource, /handleAiExtract/);
  assert.match(formSource, /personaId:\s*"sales"/);
  assert.match(formSource, /mode:\s*"extract-contact-outcome"/);
  assert.match(customersSource, /<ContactRecordForm[\s\S]*?aiContext=\{/);
});

// ── 삭제 · 생성 ──────────────────────────────────────────────────────────────

test("CustomerDeleteAction announces 3.5s undo window and undoable deletion", () => {
  assert.match(customersSource, /삭제 후 3\.5초간 되돌릴 수 있습니다/);
  assert.match(customersSource, /삭제 \(되돌리기 지원\)/);
  assert.match(customersSource, /guard: UNREFERENCED_GUARD/);
});

test("deleteNotice renders as a floating toast banner with undo action and DESIGN.md tokens", () => {
  assert.match(customersSource, /position:\s*"fixed"/);
  assert.match(customersSource, /bottom:\s*24/);
  assert.match(customersSource, /left:\s*"50%"/);
  assert.match(customersSource, /boxShadow:\s*"var\(--shadow-pop\)"/);
  assert.match(customersSource, /className="fade-up"/);
  assert.match(customersSource, /되돌리기 \(취소\)/);
});

test("NewCustomerDrawer asks for a first promise and only sends fields the route persists", () => {
  const drawer = slice("function NewCustomerDrawer", "// ── 목록");
  assert.match(drawer, /<CheckboxRow\s+checked=\{isImportant\}\s+onChange=\{setIsImportant\}\s+text="⭐ 중요 고객으로 등록 \(집중도 높임\)"/);
  assert.match(drawer, /focusOverride: isImportant \? "raise" : "default"/);
  assert.match(drawer, /next_action: nextAction\.trim\(\)/);
  assert.match(drawer, /next_action_at: nextActionAt/);
  // 리드 생성 경로에 연락처 쓰기가 없다 — 버려질 입력을 받지 않는다.
  assert.doesNotMatch(drawer, /contactName|contactPhone/);
  assert.match(drawer, /presentation="compact"/);
});

// ── 렌더 스모크 — 실제 페이지를 격리된 훅으로 그린다(deals.regression-1과 같은 방식) ──────────

const ts = (await import("typescript")).default;
const helpers = await import("../../../lib/sales-os/customer-list.js");
const dealStages = await import("../../../lib/deal-stages.js");
const leadLabels = await import("../../../lib/sales-os/lead-labels.js");
const customerLabels = await import("../../../lib/sales-os/customer-labels.js");
const deleteContract = await import("../../../lib/sales-os/customer-delete-contract.js");
const followupScoring = await import("../../../lib/sales-os/followup-scoring.js");
const contactRecord = await import("../../../lib/sales-os/contact-record.js");
const recordContext = await import("../../../lib/sales-os/record-context.js");
const uuid = await import("../../../lib/uuid.js");
const workspaceMap = await import("../workspace-map.js");
const { guidanceRequest } = await import("../guidance-advice-client.js");
const { GURU_CARDS } = await import("@com-moon/guru-guidance");
const { adviceScopeForRecord } = await import("../../../lib/sales-os/advice-scope.js");
const { recommendationForSubject } = await import("../guru-recommendations-client.js");
const leadEnrichment = await import("../../../lib/sales-os/lead-enrichment.js");
const crmNudge = await import("../crm-nudge.jsx");

const pageJs = ts.transpileModule(
  customersSource.replace(/^import[\s\S]*?;\s*$/gm, "").replace("export function Customers", "function Customers"),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

const HOST_COMPONENTS = [
  "OfficeWorkflowPanel", "RelatedCustomerProjects", "ContextMemoDrawer", "Iconed", "Badge", "Button", "IconButton",
  "Avatar", "EmptyState", "TruthBadge", "Kbd", "Drawer", "SegmentedControl", "CheckboxRow", "TextField", "TextAreaField",
  "SelectField", "Skeleton", "CertaintyBadge", "ChipToggle", "LifecycleBadge", "DateQuickPresets", "ContactRecordForm",
  "LeadEnrichmentPanel", "SortHead", "FloatingMentorWidget", "GuruGuidanceCard", "ContextMentorRail", "SuggestionTip",
  "GuidanceQuestionDrawer", "GuruRecommendation", "RecordContextColumn", "RecordReceipt", "RecordMemoPane",
];

// memoSearch · nudges · fetch: 드로어가 읽는 것들을 바꿔 끼운다(기본은 읽기 성공 · 넛지 없음 · 네트워크 없음).
function mountCustomers({ state = "live", leads = [], accounts = [], params = "", guruRecommendations = [], memoSearch = null, nudges = null, fetch: fetchImpl = null } = {}) {
  // 훅 상태는 컴포넌트 경로별로 둔다 — 드로어가 기록 모드로 바뀌면 자식 구성이 달라지므로
  // 전역 인덱스 하나로는 React처럼 인스턴스별 상태를 흉내 낼 수 없다.
  const slots = new Map();
  const saves = [];
  // 효과는 저절로 돌지 않는다(읽기 · 창 리스너가 섞여 있다) — 그린 뒤 runEffects로 골라 돌린다.
  let effects = [];
  let path = "root";
  let index = 0;
  let tree;
  const slot = () => `${path}:${index++}`;
  const Fragment = (props) => props.children;
  const React = {
    Fragment,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter((c) => c != null && c !== false && c !== "") } }),
    useState: (initial) => {
      const key = slot();
      if (!slots.has(key)) slots.set(key, typeof initial === "function" ? initial() : initial);
      return [slots.get(key), (value) => { slots.set(key, typeof value === "function" ? value(slots.get(key)) : value); }];
    },
    useRef: (initial) => { const key = slot(); if (!slots.has(key)) slots.set(key, { current: initial }); return slots.get(key); },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn); },
  };
  const ledger = { leads, accounts, deals: [], contacts: [], stages: [] };
  const deps = {
    React,
    useSearchParams: () => new URLSearchParams(params),
    useRouter: () => ({ replace() {} }),
    usePathname: () => "/dashboard/revenue/customers",
    useToast: () => Object.assign(() => {}, { success() {}, error() {}, info() {} }),
    useUndoableAction: () => ({ schedule() {}, cancel: () => true }),
    useCrmKeyboard() {},
    useCrmSelection: () => ({ selectedId: null, moveSelection() {}, setSelectedId() {}, clearSelected() {} }),
    useRevenueLedger: () => ({ ledger, syncState: state, reload() {} }),
    saveRevenueRecord: async (...args) => { saves.push(args); return { ok: true, status: "saved" }; },
    useMemoSearch: memoSearch || (() => ({ status: "live", entries: [], refresh() {} })),
    // 페이지 안의 fetch(드로어의 활동 읽기)를 가린다 — 시험이 네트워크로 나가지 않는다.
    fetch: fetchImpl || (async () => { throw new Error("no network in tests"); }),
    requestPersonaChat: async () => ({ state: "done", text: "" }),
    brandInWorkspace: workspaceMap.brandInWorkspace,
    filterLeadsByWorkspace: workspaceMap.filterLeadsByWorkspace,
    filterAccountsByWorkspace: workspaceMap.filterAccountsByWorkspace,
    DEAL_STAGES: dealStages.DEAL_STAGES, STAGE_FILL: dealStages.STAGE_FILL,
    isCanonicalUuid: uuid.isCanonicalUuid,
    UNREFERENCED_GUARD: deleteContract.UNREFERENCED_GUARD, describeReferences: deleteContract.describeReferences,
    LEAD_SUBJECTS: leadLabels.LEAD_SUBJECTS, subjectLabels: leadLabels.subjectLabels,
    ...customerLabels,
    REACTION_LABEL: followupScoring.REACTION_LABEL,
    addSavedNoteRow: contactRecord.addSavedNoteRow,
    applyReceiptEvent: contactRecord.applyReceiptEvent,
    recordReceipt: contactRecord.recordReceipt,
    recordWindowLayout: contactRecord.recordWindowLayout,
    recordTab: contactRecord.recordTab,
    RECORD_TABS: contactRecord.RECORD_TABS,
    RECORD_LAYOUT_QUERIES: contactRecord.RECORD_LAYOUT_QUERIES,
    ACT_ICON: recordContext.ACTIVITY_ICON,
    recordRowKind: recordContext.recordRowKind,
    recordContextTruth: recordContext.recordContextTruth,
    memoStreamRows: recordContext.memoStreamRows,
    upsertSavedMemo: recordContext.upsertSavedMemo,
    adviceScopeForRecord,
    useGuruRecommendations: ({ enabled } = {}) => ({ status: enabled ? "live" : "idle", recommendations: enabled ? guruRecommendations : [], reload() {} }),
    recommendationForSubject,
    ...helpers,
    isTemplateNextAction: leadEnrichment.isTemplateNextAction,
    TIP_RULE_IDS: crmNudge.TIP_RULE_IDS,
    nudgeTipReason: crmNudge.nudgeTipReason,
    // 실제 훅은 fetch로 넛지를 읽는다 — 이 렌더 스모크는 이 화면의 목록·드로어 그리기만
    // 확인하므로 넛지 없는 정적 상태로 둔다(넛지 자체 계약은 crm-nudge.test.mjs가 고정).
    useCrmNudges: () => ({ status: nudges ? "live" : "preview", nudges: nudges || [], unrecordedMeetings: [], failedSources: [], busyKey: null, suppress: async () => ({ ok: true }), refresh() {} }),
  };
  for (const name of HOST_COMPONENTS) deps[name] = name;
  const { Customers, ActivityTimeline } = new Function(...Object.keys(deps), `${pageJs}; return { Customers, ActivityTimeline };`)(...Object.values(deps));

  const call = (fn, props, at) => {
    const saved = [path, index];
    path = at; index = 0;
    try { return fn(props); } finally { [path, index] = saved; }
  };
  const expand = (node, at) => {
    if (Array.isArray(node)) {
      return node.flatMap((child, i) => {
        const e = expand(child, `${at}.${child?.props?.key ?? i}`);
        return Array.isArray(e) ? e : [e];
      });
    }
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") {
      const here = `${at}/${node.type.name || "anon"}`;
      return expand(call(node.type, node.props, here), here);
    }
    const props = { ...node.props, children: expand(node.props.children || [], at) };
    if (props.footer) props.footer = expand(props.footer, `${at}~footer`); // Drawer 발판도 트리의 일부다
    return { ...node, props };
  };
  const render = () => { effects = []; tree = expand(call(Customers, { onNavigate() {} }, "root"), "root"); return tree; };
  // 마지막으로 그린 트리의 효과 중 고른 것만 돌린다 → 돌린 개수.
  const runEffects = (pick) => { const picked = effects.filter(pick); picked.forEach((fn) => fn()); return picked.length; };
  const findAll = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.props?.footer || []), ...findAll(predicate, node.props?.children || [])];
  };
  const text = (node = tree) => {
    if (Array.isArray(node)) return node.map(text).join("");
    if (node == null || typeof node !== "object") return node == null ? "" : String(node);
    return text(node.props?.children || []);
  };
  render();
  // 기록 타임라인은 활동 읽기(effect)가 끝나야 드로어에 보인다 — 그리기 계약은 따로 세워 본다.
  const renderTimeline = (props) => expand({ type: ActivityTimeline, props }, "timeline");
  return { render, findAll, text, saves, renderTimeline, runEffects };
}

const dayKey = (offset) => helpers.addDaysKey(new Date(), offset);
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const renderLeads = () => [
  { id: "11111111-1111-4111-8111-111111111111", name: "테스트학원 A", stage: "Contact", nextAction: "견적서 보내기", nextActionAt: dayKey(-2), lastReaction: "positive", lastContactAt: ago(5), createdAt: ago(40), value: "₩2.4M" },
  { id: "22222222-2222-4222-8222-222222222222", name: "테스트학원 B", stage: "New", nextAction: "첫 통화", nextActionAt: dayKey(0), createdAt: ago(1), lastContactAt: ago(1) },
  { id: "33333333-3333-4333-8333-333333333333", name: "테스트학원 C", stage: "Contact", createdAt: ago(9), lastContactAt: ago(3) },
  { id: "44444444-4444-4444-8444-444444444444", name: "테스트학원 D", stage: "Lost", createdAt: ago(90) },
];
const renderAccounts = () => [
  { id: "55555555-5555-4555-8555-555555555555", name: "계약학원 E", nextAction: "재계약 안내", nextActionAt: dayKey(1), value: 1800000, deals: 1, last: "3일 전" },
];
const rowsOf = (app) => app.findAll((n) => n.props?.["data-customer-row"]);

test("render: 진행 중 lists open customers by recent contact, rails the overdue one, counts every segment", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  const rows = rowsOf(app);
  assert.deepEqual(rows.map((r) => r.props["data-customer-row"]), [
    "lead:33333333-3333-4333-8333-333333333333",
    "lead:11111111-1111-4111-8111-111111111111",
    "lead:22222222-2222-4222-8222-222222222222",
  ]);
  assert.equal(rows[1].props["data-urgent"], "true");
  assert.equal(rows[0].props["data-urgent"], undefined);
  assert.match(app.text(rows[1]), /2일 지남/);
  assert.match(app.text(rows[1]), /긍정5일 전/);
  assert.match(app.text(rows[2]), /오늘/);
  assert.match(app.text(rows[0]), /다음 약속 없음/);
  const seg = app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "고객 구분")[0];
  assert.deepEqual(seg.props.options.map((o) => [o.key, o.count]), [["active", 3], ["won", 1], ["new", 1], ["dormant", 0], ["all", 5]]);
  assert.match(app.text(), /3명 표시/);
  assert.match(app.text(), /정렬: 최근 연락 · 최근 컨택·문의 · 구매 고객 순/);
});

test("render: typing switches to 전체, and a miss offers clear and create", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  const input = () => app.findAll((n) => n.type === "input" && n.props["aria-label"] === "고객 검색")[0];
  input().props.onChange({ target: { value: "계약학원" } });
  app.render();
  assert.deepEqual(rowsOf(app).map((r) => r.props["data-customer-row"]), ["account:55555555-5555-4555-8555-555555555555"]);
  input().props.onChange({ target: { value: "없는이름" } });
  app.render();
  const empty = app.findAll((n) => n.type === "EmptyState")[0];
  assert.equal(empty.props.title, "'없는이름'에 맞는 고객이 없어요");
});

test("render: a failed read with no rows is an error state, not an empty list", () => {
  const app = mountCustomers({ state: "error" });
  assert.equal(app.findAll((n) => n.type === "EmptyState").length, 0);
  const alert = app.findAll((n) => n.props?.role === "alert" && n.props.className === "customers-state")[0];
  assert.ok(alert);
  assert.equal(app.findAll((n) => n.type === "TruthBadge" && n.props.state === "error").length, 1);
});

test("render: opening a row shows the promise first and one primary record action", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  rowsOf(app).find(row => row.props["data-customer-row"] === "lead:11111111-1111-4111-8111-111111111111").props.onClick();
  app.render();
  const drawer = app.findAll((n) => n.type === "Drawer")[0];
  assert.ok(drawer, "drawer opens");
  assert.equal(drawer.props.title, "테스트학원 A");
  const promise = app.findAll((n) => n.props?.["aria-label"] === "다음 약속")[0];
  assert.equal(promise.props["data-late"], "true");
  assert.match(app.text(promise), /견적서 보내기/);
  assert.match(app.text(promise), /2일 지남/);
  const primaries = app.findAll((n) => n.type === "Button" && n.props.variant === "primary");
  // 페이지 히어로의 '＋ 고객' + 드로어의 '연락 기록' — 드로어 안에서는 하나.
  assert.equal(primaries.filter((b) => /연락 기록/.test(app.text(b))).length, 1);
  assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 0);
  // 했어요 · 기록 → 같은 드로어가 기록 모드로 바뀐다(오버레이 하나).
  const did = app.findAll((n) => n.type === "Button" && /했어요 · 기록/.test(app.text(n)))[0];
  did.props.onClick();
  app.render();
  const form = app.findAll((n) => n.type === "ContactRecordForm")[0];
  assert.ok(form, "record mode renders the shared form inline");
  assert.equal(form.props.draft.summary, "견적서 보내기");
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);
  assert.equal(app.findAll((n) => n.type === "Drawer")[0].props.title, "연락 기록");
});

// ── 2026-09-30 넓은 기록창 ② — 읽던 드로어가 넓어진다(권장 · 화면 확인 뒤 확정) ─────────────

const REST_WIDTH = "min(480px, 96vw)";
const WIDE_WIDTH = "min(960px, calc(100% - 56px))";
const openLeadA = (app) => {
  rowsOf(app).find(row => row.props["data-customer-row"] === "lead:11111111-1111-4111-8111-111111111111").props.onClick();
  app.render();
};
const drawerOf = (app) => app.findAll((n) => n.type === "Drawer")[0];

test("render: 연락 기록 widens the same drawer — composer on the left, read-only context on the right, two ESCs to close", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  openLeadA(app);
  assert.equal(drawerOf(app).props.width, REST_WIDTH, "읽을 땐 좁게");
  assert.equal(drawerOf(app).props.bodyStyle, undefined);
  assert.equal(app.findAll((n) => n.type === "RecordContextColumn").length, 0);

  app.findAll((n) => n.type === "Button" && n.props.variant === "primary" && /연락 기록/.test(app.text(n)))[0].props.onClick();
  app.render();
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 1, "같은 드로어 — 오버레이는 하나");
  assert.equal(drawerOf(app).props.width, WIDE_WIDTH);
  assert.equal(drawerOf(app).props.presentation, "side");
  // 두 칸이 각자 흐른다 — 본문 여백과 본문 스크롤은 걷는다.
  assert.deepEqual(drawerOf(app).props.bodyStyle, { padding: 0, gap: 0, overflow: "hidden" });

  const win = app.findAll((n) => n.props?.className === "record-window")[0];
  assert.ok(win, "두 칸 그릇");
  const [main, column] = win.props.children;
  assert.equal(main.props["aria-label"], "기록 쓰기");
  const form = app.findAll((n) => n.type === "ContactRecordForm", main)[0];
  assert.equal(form.props.layout, "wide");
  assert.equal(form.props.autoFocus, true, "커서는 요약 칸에");
  assert.equal(column.type, "RecordContextColumn");

  // 읽기 칸은 드로어가 이미 아는 것만 받는다 — 약속 · 기록 줄기 · 읽기 상태. 쓰기 콜백은 없다.
  assert.equal(column.props.promise.what, "견적서 보내기");
  assert.equal(column.props.promise.late, 2);
  assert.deepEqual(column.props.truth, { state: "loading", reason: "", retry: null, memos: "live" }, "활동 읽기가 끝나기 전");
  assert.equal(column.props.tipReason, "", "이 사람에게 고른 팁이 없으면 지어내지 않는다");
  assert.deepEqual(column.props.rows, []);
  assert.deepEqual(Object.keys(column.props).filter((key) => /^on[A-Z]/.test(key)), ["onRetry"]);

  // 쓰는 동안 쉬는 드로어의 본문(약속 카드 · 거래 · 정보)은 자리를 비키고, primary는 폼의 저장 하나다.
  assert.equal(app.findAll((n) => n.props?.className === "customer-focus").length, 0);
  assert.equal(app.findAll((n) => n.type === "Button" && n.props.variant === "primary" && /연락 기록/.test(app.text(n))).length, 0);
  // 연락이 아닌 한 줄 메모(QuickLog)는 넓은 기록창에 없다 — 같은 칸의 메모 모드가 대신한다(2026-09-30 ⑥).
  assert.equal(app.findAll((n) => n.type === "details", form).length, 0);
  assert.doesNotMatch(app.text(form), /연락이 아닌 한 줄 메모|빠른 메모/);
  assert.equal(form.props.mode, "contact", "R · 연락 기록 버튼은 연락 기록 모드로 연다");
  assert.equal(typeof form.props.memo, "function", "메모 칸은 폼의 memo 자리에 넘긴다");

  // 첫 ESC(= Drawer의 onClose) → 480px로 돌아오고 폼이 사라진다. 드로어는 열려 있다.
  drawerOf(app).props.onClose();
  app.render();
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);
  assert.equal(drawerOf(app).props.width, REST_WIDTH);
  assert.equal(drawerOf(app).props.title, "테스트학원 A");
  assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 0);
  // 두 번째 ESC → 닫힌다.
  drawerOf(app).props.onClose();
  app.render();
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 0);
});

test("render: the context column shows the one tip this customer already has — reason only", () => {
  const TEMPLATE = "고객 활성 상태 확인 → 갱신·휴면 여부 정리";
  const templated = { id: "66666666-6666-4666-8666-666666666666", name: "템플릿학원 F", stage: "Contact", nextAction: TEMPLATE, nextActionIsTemplate: true, createdAt: ago(10), lastContactAt: ago(10) };
  const app = mountCustomers({ leads: [templated] });
  rowsOf(app)[0].props.onClick();
  app.render();
  app.findAll((n) => n.type === "Button" && n.props.variant === "primary" && /연락 기록/.test(app.text(n)))[0].props.onClick();
  app.render();
  const column = app.findAll((n) => n.type === "RecordContextColumn")[0];
  assert.equal(column.props.promise.state, "template");
  assert.equal(column.props.tipReason, TEMPLATE, "[다음 약속] 카드가 보이던 같은 제안");
});

const openWide = (app) => {
  app.findAll((n) => n.type === "Button" && n.props.variant === "primary" && /연락 기록/.test(app.text(n)))[0].props.onClick();
  app.render();
};
const formOf = (app) => app.findAll((n) => n.type === "ContactRecordForm")[0];
const columnOf = (app) => app.findAll((n) => n.type === "RecordContextColumn")[0];
const phasesOf = (app) => columnOf(app).props.rows.map((row) => contactRecord.recordReceipt(row)?.phase || null);

// 읽기 칸의 맨 윗줄이 영수증이다 — 기록창(폼)이 알리는 저장 사건이 드로어를 거쳐 그 줄에 닿는지를 끝까지 돌려 본다.
test("render: the form's save events drive the newest context row — 기록 중 → 저장 중 → 일부 저장 → 저장됨, and the saved 자세히 stays on screen", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  openLeadA(app);
  openWide(app);
  assert.deepEqual(columnOf(app).props.rows, []);

  // 저장을 눌렀다(되돌리기 창) — 새 줄이 맨 위에 "기록 중"으로 선다.
  formOf(app).props.onSaved({ activityId: "local-7", kind: "call", summary: "견적 검토 통화", reaction: "positive" });
  app.render();
  const [optimistic] = columnOf(app).props.rows;
  assert.deepEqual([optimistic.id, optimistic.type, optimistic.msg, optimistic.reaction], ["local-7", "call", "견적 검토 통화", "positive"]);
  assert.deepEqual(phasesOf(app), ["pending"]);

  // 되돌리기 창이 닫혀 요청이 나갔다.
  formOf(app).props.onSending({ optimisticId: "local-7" });
  app.render();
  assert.deepEqual(phasesOf(app), ["sending"]);

  // 요약이 확인됐다 — 줄의 ID가 서버 ID로 바뀐다. 아직 "저장됨"이 아니다(자세히가 남았다).
  formOf(app).props.onSummaryPersisted({ activityId: "srv-1", optimisticId: "local-7" });
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.id), ["srv-1"]);
  assert.deepEqual(phasesOf(app), ["sending"]);

  // 자세히(note)가 실패했다 — 같은 줄이 "일부 저장"이다(저장됨이 아니다).
  formOf(app).props.onPartial({ activityId: "srv-1", optimisticId: "local-7" });
  app.render();
  assert.deepEqual(phasesOf(app), ["partial"]);
  assert.match(contactRecord.recordReceipt(columnOf(app).props.rows[0]).time, /^\d{2}:\d{2}$/);

  // 다시 저장이 됐다 — 요약 줄은 "저장됨", 그리고 자세히가 제 줄로 줄기에 선다(다시 열지 않아도 보인다).
  formOf(app).props.onPersisted({ activityId: "srv-1", optimisticId: "local-7", note: { id: "note-1", body: "[결정사항]\n- 10월 셋째 주 시범 채점" } });
  app.render();
  const rows = columnOf(app).props.rows;
  assert.deepEqual(rows.map((row) => [row.id, row.type]), [["note-1", "note"], ["srv-1", "call"]]);
  assert.equal(rows[0].msg, "[결정사항]\n- 10월 셋째 주 시범 채점");
  assert.deepEqual(phasesOf(app), ["saved", "saved"]);
  assert.deepEqual(recordContext.recordContextRows(rows).map((row) => [row.shape, row.lineCount, row.receipt.label]), [["memo", 2, "저장됨"], ["contact", 1, "저장됨"]]);

  // 저장이 확인되면 폼이 닫아 달라고 한다(onDone) — 같은 드로어가 480px로 돌아온다.
  formOf(app).props.onDone();
  app.render();
  assert.equal(drawerOf(app).props.width, REST_WIDTH);
  assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 0);
});

test("render: undo removes the optimistic row, and a save without 자세히 (or a skipped one) adds no note row", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  openLeadA(app);
  openWide(app);
  formOf(app).props.onSaved({ activityId: "local-8", kind: "meeting", summary: "되돌릴 기록", reaction: "neutral" });
  app.render();
  assert.deepEqual(phasesOf(app), ["pending"]);
  formOf(app).props.onUndone("local-8");
  app.render();
  assert.deepEqual(columnOf(app).props.rows, [], "되돌리면 줄이 사라진다 — 보내지 않았다");

  // 요약만 있는 저장: 요청 하나, 줄 하나.
  formOf(app).props.onSaved({ activityId: "local-9", kind: "call", summary: "한 줄 기록", reaction: "positive" });
  formOf(app).props.onSending({ optimisticId: "local-9" });
  formOf(app).props.onSummaryPersisted({ activityId: "srv-2", optimisticId: "local-9" });
  formOf(app).props.onPersisted({ activityId: "srv-2", optimisticId: "local-9" });
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.id), ["srv-2"]);
  assert.deepEqual(phasesOf(app), ["saved"]);

  // 일부 저장 뒤 건너뛰기: 폼은 note 없이 저장 확인을 넘긴다 — 줄은 "저장됨"으로 풀리고 note 줄은 없다.
  formOf(app).props.onSaved({ activityId: "local-10", kind: "call", summary: "건너뛴 기록", reaction: "positive" });
  formOf(app).props.onSummaryPersisted({ activityId: "srv-3", optimisticId: "local-10" });
  formOf(app).props.onPartial({ activityId: "srv-3", optimisticId: "local-10" });
  app.render();
  assert.equal(phasesOf(app)[0], "partial");
  formOf(app).props.onPersisted({ activityId: "srv-3", optimisticId: "local-10" });
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.id), ["srv-3", "srv-2"]);
  assert.deepEqual(phasesOf(app), ["saved", "saved"]);
});

const isActivityRead = (fn) => /^\(\) => \{ reload\(\); \}$/.test(String(fn));
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("render: the context column mirrors the drawer's reads — partial when linked memos fail, and each retry re-reads the right source", async () => {
  const reads = [];
  let memoRefreshes = 0;
  const app = mountCustomers({
    leads: renderLeads(),
    accounts: renderAccounts(),
    memoSearch: () => ({ status: "error", entries: [], refresh() { memoRefreshes += 1; } }),
    fetch: async (url) => {
      reads.push(String(url));
      return { ok: true, json: async () => ({ status: "live", activities: [{ id: "a1", type: "call", msg: "지난 통화", reaction: "positive", occurredAt: ago(2) }] }) };
    },
  });
  openLeadA(app);
  // 드로어가 열리면 활동을 읽는다 — 읽기가 끝나기 전에는 loading이다.
  assert.equal(app.runEffects(isActivityRead), 1);
  await settle();
  app.render();
  assert.equal(reads.length, 1);
  assert.match(reads[0], /^\/api\/hub\/revenue\/activity\?leadId=11111111-1111-4111-8111-111111111111$/);

  openWide(app);
  const column = columnOf(app);
  // 활동은 읽었고 연결 메모만 못 읽었다 — 읽은 줄은 보이고, 빠진 출처를 이름으로 말한다.
  assert.deepEqual(column.props.truth, { state: "partial", reason: "연결 메모를 읽지 못했어요", retry: "memos", memos: "error" });
  // 메모 읽기 실패는 빈 자리에서도 '메모가 없어요'로 읽히지 않는다 — 읽기 칸이 이 상태로 말을 고른다.
  assert.deepEqual(recordContext.recordEmptyPlan({ filter: "memo", total: column.props.rows.length, state: column.props.truth.state, memos: column.props.truth.memos }),
    { kind: "text", text: "메모를 읽지 못했어요 — 없는 게 아니라 못 읽은 거예요." });
  assert.deepEqual(column.props.rows.map((row) => row.id), ["a1"]);
  // 다시 읽기는 못 읽은 그 출처를 다시 읽는다.
  column.props.onRetry("memos");
  assert.deepEqual([memoRefreshes, reads.length], [1, 1]);
  column.props.onRetry("activities");
  await settle();
  assert.deepEqual([memoRefreshes, reads.length], [1, 2]);

  // 활동 읽기가 실패하면 읽기 칸은 error다 — "기록 없음"으로 읽히지 않는다.
  const failing = mountCustomers({ leads: renderLeads(), fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }) });
  openLeadA(failing);
  failing.runEffects(isActivityRead);
  await settle();
  failing.render();
  openWide(failing);
  assert.deepEqual(columnOf(failing).props.truth, { state: "error", reason: "활동 기록을 읽지 못했어요", retry: "activities", memos: "live" });

  // 연결 메모를 아직 읽는 중이면 읽기 칸은 그 사실을 받는다 — 빈 자리가 Skeleton이지 '메모가 없어요'가 아니다.
  const reading = mountCustomers({
    leads: renderLeads(),
    memoSearch: () => ({ status: "loading", entries: [], refresh() {} }),
    fetch: async () => ({ ok: true, json: async () => ({ status: "live", activities: [{ id: "a1", type: "call", msg: "지난 통화", occurredAt: ago(2) }] }) }),
  });
  openLeadA(reading);
  reading.runEffects(isActivityRead);
  await settle();
  reading.render();
  openWide(reading);
  const truth = columnOf(reading).props.truth;
  assert.deepEqual(truth, { state: "live", reason: "", retry: null, memos: "loading" });
  assert.deepEqual(recordContext.recordEmptyPlan({ filter: "memo", total: 1, state: truth.state, memos: truth.memos }), { kind: "loading", label: "메모 불러오는 중" });
});

test("render: a nudge for this customer wins the context column's one tip over the template suggestion", () => {
  const TEMPLATE = "고객 활성 상태 확인 → 갱신·휴면 여부 정리";
  const id = "66666666-6666-4666-8666-666666666666";
  const templated = { id, name: "템플릿학원 F", stage: "Contact", nextAction: TEMPLATE, nextActionIsTemplate: true, createdAt: ago(10), lastContactAt: ago(10) };
  const nudge = { ruleId: "reaction_open", subject: { id }, title: "우려 반응 뒤 정리 없음", reason: "5일째", action: { label: "정리 기록" }, escape: [] };
  const app = mountCustomers({ leads: [templated], nudges: [nudge] });
  rowsOf(app)[0].props.onClick();
  app.render();
  openWide(app);
  // [다음 약속] 카드와 같은 우선순위(넛지 > 템플릿 제안) — 이유 한 줄만, 행동은 없다.
  assert.equal(columnOf(app).props.tipReason, "우려 반응 뒤 정리 없음 · 5일째");
  assert.equal(columnOf(app).props.promise.state, "template");
  // 팁 대상이 아닌 규칙의 넛지는 읽기 칸으로 오지 않는다 — 템플릿 제안으로 내려간다.
  const other = mountCustomers({ leads: [templated], nudges: [{ ...nudge, ruleId: "something_else" }] });
  rowsOf(other)[0].props.onClick();
  other.render();
  openWide(other);
  assert.equal(columnOf(other).props.tipReason, TEMPLATE);
});

test("render: leaving record mode hands focus back to 연락 기록 — once, and never on first open", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  openLeadA(app);
  const isFocusReturn = (fn) => /wasRecordingRef/.test(String(fn));
  let focused = 0;
  const recordButton = app.findAll((n) => n.type === "Button" && n.props.ref && /연락 기록/.test(app.text(n)))[0];
  assert.ok(recordButton, "쉬는 드로어의 연락 기록 버튼이 ref를 받는다");
  recordButton.props.ref.current = { focus() { focused += 1; } };

  // 드로어를 처음 열었을 때 — 포커스를 가로채지 않는다.
  assert.equal(app.runEffects(isFocusReturn), 1);
  assert.equal(focused, 0);
  // 기록 모드로 들어갔다 — 커서는 폼의 것이다.
  openWide(app);
  app.runEffects(isFocusReturn);
  assert.equal(focused, 0);
  // 첫 ESC(= onClose)로 기록 모드를 떠났다 — 폼이 사라져 떨어진 포커스를 같은 드로어의 버튼으로 돌려놓는다.
  drawerOf(app).props.onClose();
  app.render();
  app.runEffects(isFocusReturn);
  assert.equal(focused, 1);
  // 그대로 다시 그려져도(기록 모드가 아닌 채) 포커스를 또 옮기지 않는다.
  app.render();
  app.runEffects(isFocusReturn);
  assert.equal(focused, 1);
});

// ── 2026-09-30 넓은 기록창 ③ — 좁은 화면: 탭(≤900px) · 전체 높이 시트(≤600px) (Q-CR3 · Q-CR11, 권장) ────────

// 화면 폭을 세운다 — 드로어가 듣는 미디어 쿼리(max-width)에 그 폭으로 답한다. 커서 옮기기(rAF)는 모아 둔다.
function atWidth(width, run) {
  const had = { window: Object.hasOwn(globalThis, "window"), raf: Object.hasOwn(globalThis, "requestAnimationFrame") };
  const before = { window: globalThis.window, raf: globalThis.requestAnimationFrame };
  const frames = [];
  globalThis.window = {
    matchMedia: (query) => ({ matches: width <= Number(/max-width: (\d+)px/.exec(query)?.[1] ?? -1), addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  try { return run(frames); } finally {
    if (had.window) globalThis.window = before.window; else delete globalThis.window;
    if (had.raf) globalThis.requestAnimationFrame = before.raf; else delete globalThis.requestAnimationFrame;
  }
}
const windowOf = (app) => app.findAll((n) => n.props?.className === "record-window")[0];
const tabsOf = (app) => app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "보기")[0];
const peekOf = (app) => app.findAll((n) => n.type === "button" && /record-window__peek/.test(n.props.className || ""))[0];
const recordFooterOf = (app) => app.findAll((n) => n.type === "Button" && /고객 정보로/.test(app.text(n)))[0];

test("render: on a phone the record window is the same bottom sheet at full height — save in the header, no footer", () => {
  atWidth(390, () => {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    // 행을 눌러 연 쉬는 드로어 — 지금 바닥 시트 그대로다. 글쓰기 칸이 없어 키보드가 오르지 않는다.
    assert.equal(drawerOf(app).props.presentation, "compact");
    assert.equal(drawerOf(app).props.sheet, "auto");
    assert.equal(drawerOf(app).props.headerAction, null);
    assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 0);
    // Drawer는 본문의 첫 조작에 커서를 둔다 — 그게 버튼이다(글 칸은 접힌 칸 안에만 있다).
    const controls = app.findAll((n) => ["Button", "IconButton", "TextField", "TextAreaField", "SelectField", "input", "textarea", "select", "button"].includes(n.type), drawerOf(app).props.children);
    assert.equal(controls[0].type, "Button", "행을 눌러 열 때 커서가 글 칸에 서지 않는다");

    openWide(app);
    // 같은 Drawer(오버레이 하나) — 바닥 시트가 전체 높이로 서고, 저장 자리가 머리에 생긴다. 발판은 없다.
    assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);
    const drawer = drawerOf(app);
    assert.equal(drawer.props.presentation, "compact");
    assert.equal(drawer.props.sheet, "full");
    assert.equal(drawer.props.width, REST_WIDTH);
    assert.deepEqual(drawer.props.bodyStyle, { padding: 0, gap: 0, overflow: "hidden" });
    assert.equal(drawer.props.title, "연락 기록");
    assert.equal(drawer.props.footer, null, "맨 아래는 키보드 위 칩 줄의 자리다 — 머리의 닫기가 '고객 정보로'다");
    assert.equal(recordFooterOf(app), undefined);
    const slot = drawer.props.headerAction;
    assert.equal(slot.type, "span");
    assert.equal(slot.props.className, "record-window__save-slot");
    // 머리의 둘째 줄 — 누구(길면 줄어든다) + 초안이 놓인 곳의 자리. 폼이 그 자리에 '초안 · 이 탭'을 그린다:
    // 쉬는 저장 줄이 키보드 위의 글 쓸 높이를 차지하지 않는다.
    const sub = drawer.props.subtitle;
    assert.equal(sub.props.className, "record-window__sub");
    const [who, statusAt] = sub.props.children;
    assert.deepEqual([who.props.className, app.text(who)], ["record-window__sub-who", "테스트학원 A"]);
    assert.equal(statusAt.props.className, "record-window__status-slot");

    // 폼은 시트 배치다 — R · 연락 기록으로 열면 커서가 요약에 선다(autoFocus).
    const form = formOf(app);
    assert.equal(form.props.layout, "sheet");
    assert.equal(form.props.autoFocus, true);
    assert.equal(form.props.away, false);
    // 머리 자리가 서기 전 한 박자 — 제자리에 그리지 않게 null을 받는다(undefined가 아니다).
    assert.equal(form.props.saveSlot, null);
    assert.equal(form.props.statusSlot, null);
    // 자리가 서면(ref) 그 요소를 받는다 — 주 버튼은 폼이 거기에 그린다(버튼 · 상태는 하나).
    const el = { nodeType: 1 };
    const statusEl = { nodeType: 1 };
    slot.props.ref(el);
    statusAt.props.ref(statusEl);
    app.render();
    assert.equal(formOf(app).props.saveSlot, el);
    assert.equal(formOf(app).props.statusSlot, statusEl);
    assert.equal(formOf(app).props.key, form.props.key, "자리가 섰다고 폼을 다시 세우지 않는다");
    // 드로어가 직접 그리는 주 버튼은 없다 — 기록창의 주 버튼은 폼의 것 하나다.
    assert.equal(app.findAll((n) => n.type === "Button" && n.props.variant === "primary", drawerOf(app)).length, 0);

    // 두 칸은 탭이 된다 — 읽기 칸도 같은 시트 안에 있다.
    assert.deepEqual([windowOf(app).props["data-layout"], windowOf(app).props["data-tab"]], ["sheet", "write"]);
    assert.equal(app.findAll((n) => n.type === "RecordContextColumn").length, 1);

    // 첫 닫기(머리의 닫기 · ESC)는 쉬는 시트로, 자리는 걷힌다.
    slot.props.ref(null);
    drawerOf(app).props.onClose();
    app.render();
    assert.equal(drawerOf(app).props.sheet, "auto");
    assert.equal(drawerOf(app).props.headerAction, null);
    assert.equal(drawerOf(app).props.title, "테스트학원 A");
    assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 0);
  });
});

test("render: 했어요 · 기록 on a phone opens the same sheet with the promise as the summary seed", () => {
  atWidth(390, () => {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    app.findAll((n) => n.type === "Button" && /했어요 · 기록/.test(app.text(n)))[0].props.onClick();
    app.render();
    const form = formOf(app);
    assert.equal(form.props.layout, "sheet");
    assert.equal(form.props.autoFocus, true, "커서는 요약에");
    assert.equal(form.props.draft.summary, "견적서 보내기");
    assert.equal(form.props.mode, "contact");
    assert.equal(drawerOf(app).props.sheet, "full");
  });
});

test("render: the narrow tabs switch 쓰기 | 이 고객 without remounting the form — the draft stays", () => {
  atWidth(390, (frames) => {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    openWide(app);
    const opened = formOf(app);
    const tabs = tabsOf(app);
    assert.deepEqual(tabs.props.options, [{ key: "write", label: "쓰기" }, { key: "context", label: "이 고객" }]);
    assert.equal(tabs.props.value, "write");
    assert.equal(tabs.props.fill, true, "세그먼트는 좁은 화면에서도 가로로 선다");
    // 탭 → (약속 한 줄) → 기록 칸 → 읽기 칸 순서. 기록 칸과 읽기 칸은 둘 다 서 있다.
    const kinds = () => windowOf(app).props.children.map((child) => child.props.className || child.type);
    assert.deepEqual(kinds(), ["record-window__tabs", "hub-row record-window__peek", "record-window__main", "RecordContextColumn"]);

    // '이 고객'으로 — 폼은 같은 폼(key · 받은 값 그대로)이고 가려질 뿐이다(away). 다시 세우면 쓰던 글 · 되돌리기가 사라진다.
    tabs.props.onChange("context");
    app.render();
    assert.equal(windowOf(app).props["data-tab"], "context");
    assert.equal(tabsOf(app).props.value, "context");
    assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 1, "기록 칸을 걷지 않는다");
    assert.equal(formOf(app).props.key, opened.props.key);
    assert.equal(formOf(app).props.preset, opened.props.preset);
    assert.equal(formOf(app).props.draft, opened.props.draft);
    assert.equal(formOf(app).props.away, true);
    assert.equal(peekOf(app), undefined, "약속 한 줄은 쓰기 탭에서만 — 이 고객 탭에는 약속 카드가 있다");
    assert.deepEqual(kinds(), ["record-window__tabs", "record-window__main", "RecordContextColumn"]);
    assert.equal(drawerOf(app).props.sheet, "full");
    assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);

    // 아래 줄의 '쓰기로 돌아가기'(폼이 알린다) → 쓰기 탭, 같은 폼.
    formOf(app).props.onReturn();
    app.render();
    assert.equal(windowOf(app).props["data-tab"], "write");
    assert.equal(formOf(app).props.away, false);
    assert.equal(formOf(app).props.key, opened.props.key);

    // 저장이 막혔거나 실패했다(폼이 알린다) → 이유가 있는 쓰기 탭으로 돌린다.
    tabsOf(app).props.onChange("context");
    app.render();
    formOf(app).props.onAttention();
    app.render();
    assert.equal(windowOf(app).props["data-tab"], "write");
    assert.equal(formOf(app).props.away, false);

    // 약속 한 줄 — 읽던 약속이 쓰는 동안에도 남는다. 누르면 '이 고객'으로 가고 커서는 탭의 고른 칸으로.
    const peek = peekOf(app);
    // 말줄임 한 줄이라 '언제'가 앞에 선다 — 놓친 날수 · 날짜(mono) · 무엇을. 좁은 폭에서 잘리는 것은 끝의 무엇이다.
    const due = helpers.shortDateLabel(dayKey(-2));
    assert.equal(app.text(peek), `약속2일 지남 · ${due} 견적서 보내기`);
    assert.equal(app.findAll((n) => n.props?.className === "record-ctx__late", peek).length, 1, "놓친 약속은 글자 한 곳");
    const date = app.findAll((n) => n.props?.className === "mono", peek);
    assert.deepEqual(date.map((n) => app.text(n)), [due], "날짜는 mono 한 곳");
    const line = app.findAll((n) => n.props?.className === "record-window__peek-text", peek)[0].props.children;
    assert.ok(line.indexOf(date[0]) < line.indexOf("견적서 보내기"), "날짜가 무엇보다 앞이다");
    frames.length = 0;
    peek.props.onClick();
    app.render();
    assert.equal(windowOf(app).props["data-tab"], "context");
    assert.equal(frames.length, 1, "사라진 줄 대신 탭으로 커서를 옮긴다");

    // 모드를 바꿔도(연락 기록 → 메모) 탭은 그대로이고 폼도 같은 폼이다.
    formOf(app).props.onModeChange("memo");
    app.render();
    assert.equal(windowOf(app).props["data-tab"], "context");
    assert.equal(formOf(app).props.key, opened.props.key);
    assert.equal(formOf(app).props.away, true);

    // 기록 모드를 새로 열면 쓰기 탭에서 시작한다.
    drawerOf(app).props.onClose();
    app.render();
    openWide(app);
    assert.equal(windowOf(app).props["data-tab"], "write");
    assert.equal(formOf(app).props.away, false);
  });
});

test("render: between 601 and 900px the wide side drawer keeps its form and gets the same tabs — save stays in the band", () => {
  atWidth(768, () => {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    openWide(app);
    const drawer = drawerOf(app);
    // 옆 드로어 그대로 — 폭은 화면이 자른다(min(960px, 100% − 56px)). 전체 높이 시트 · 머리 저장은 휴대폰만.
    assert.equal(drawer.props.presentation, "side");
    assert.equal(drawer.props.width, WIDE_WIDTH);
    assert.equal(drawer.props.sheet, "auto");
    assert.equal(drawer.props.headerAction, null);
    assert.ok(recordFooterOf(app), "발판의 '고객 정보로'는 그대로다");
    const form = formOf(app);
    assert.equal(form.props.layout, "wide");
    assert.equal(form.props.saveSlot, undefined, "주 버튼은 아래 띠 제자리에");
    assert.equal(form.props.statusSlot, undefined, "저장 줄도 아래 띠 제자리에");
    assert.equal(drawer.props.subtitle, "테스트학원 A", "머리의 둘째 줄은 글자 그대로다");
    assert.equal(typeof form.props.memo, "function", "메모 모드도 같다");
    assert.deepEqual([windowOf(app).props["data-layout"], windowOf(app).props["data-tab"]], ["tabs", "write"]);
    assert.ok(tabsOf(app));
    assert.ok(peekOf(app));
    tabsOf(app).props.onChange("context");
    app.render();
    assert.equal(formOf(app).props.away, true);
    assert.equal(formOf(app).props.key, form.props.key);
  });
});

test("render: above 900px there are no tabs — both columns stand side by side and the form is never tucked away", () => {
  atWidth(1440, () => {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    openWide(app);
    assert.equal(tabsOf(app), undefined);
    assert.equal(peekOf(app), undefined);
    assert.deepEqual([windowOf(app).props["data-layout"], windowOf(app).props["data-tab"]], ["wide", "write"]);
    assert.equal(formOf(app).props.layout, "wide");
    assert.equal(formOf(app).props.away, false);
    assert.equal(formOf(app).props.saveSlot, undefined);
    assert.equal(drawerOf(app).props.headerAction, null);
    assert.equal(windowOf(app).props.children.length, 2, "쓰기 칸 · 읽기 칸 둘뿐");
  });
});

// ── 2026-09-30 넓은 기록창 ⑥ — 같은 칸에서 메모 쓰기(Q-CR6 · 권장, 화면 확인 뒤 확정) ──────────────

const LEAD_A = "11111111-1111-4111-8111-111111111111";
const memoButtonOf = (app) => app.findAll((n) => n.type === "Button" && n.props.icon === "pencil" && app.text(n) === "메모")[0];
const memoPaneOf = (app, slot = { saveRef: { current: null }, contactLine: null }) => formOf(app).props.memo(slot);

test("render: the wide window has two modes — the switch retitles the same drawer and keeps the same form", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  openLeadA(app);
  openWide(app);
  const opened = formOf(app);
  assert.equal(opened.props.mode, "contact");
  assert.equal(drawerOf(app).props.title, "연락 기록");

  // 전환 칸을 누르면(폼이 알린다) 같은 드로어 · 같은 폭 · 같은 폼(key)인 채로 모드와 제목만 바뀐다.
  opened.props.onModeChange("memo");
  app.render();
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);
  assert.equal(drawerOf(app).props.title, "메모");
  assert.equal(drawerOf(app).props.subtitle, "테스트학원 A");
  assert.equal(drawerOf(app).props.width, WIDE_WIDTH);
  assert.equal(formOf(app).props.mode, "memo");
  assert.equal(formOf(app).props.key, opened.props.key, "폼을 다시 세우지 않는다 — 쓰던 연락 기록이 남는다");
  assert.equal(formOf(app).props.preset, opened.props.preset);
  assert.equal(app.findAll((n) => n.type === "RecordContextColumn").length, 1, "읽기 칸은 그대로 옆에 있다");
  assert.equal(app.findAll((n) => n.type === "ContextMemoDrawer").length, 0, "드로어를 메모 창으로 바꾸지 않는다");

  // 메모 칸 — 이 고객이 문맥으로 붙는다(lead:<id>). 폼이 넘긴 자리(saveRef · contactLine)를 그대로 받는다.
  const slot = { saveRef: { current: null }, contactLine: "연락 기록 진행 줄" };
  const pane = memoPaneOf(app, slot);
  assert.equal(pane.type, "RecordMemoPane");
  assert.deepEqual(pane.props.contexts, [{ type: "lead", id: LEAD_A, label: "테스트학원 A" }]);
  assert.equal(pane.props.saveRef, slot.saveRef);
  assert.equal(pane.props.contactLine, "연락 기록 진행 줄");
  assert.deepEqual(Object.keys(pane.props).filter((key) => /^on[A-Z]/.test(key)), ["onSaved"]);

  // 다시 연락 기록으로.
  formOf(app).props.onModeChange("contact");
  app.render();
  assert.equal(drawerOf(app).props.title, "연락 기록");
  assert.equal(formOf(app).props.mode, "contact");
  // 첫 ESC는 480px로(어느 모드에서든).
  formOf(app).props.onModeChange("memo");
  app.render();
  drawerOf(app).props.onClose();
  app.render();
  assert.equal(drawerOf(app).props.width, REST_WIDTH);
  assert.equal(drawerOf(app).props.title, "테스트학원 A");
});

test("render: the 메모 button widens the same drawer into memo mode on desktop — it no longer swaps the drawer", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  openLeadA(app);
  memoButtonOf(app).props.onClick();
  app.render();
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);
  assert.equal(app.findAll((n) => n.type === "ContextMemoDrawer").length, 0);
  assert.equal(drawerOf(app).props.title, "메모");
  assert.equal(drawerOf(app).props.width, WIDE_WIDTH);
  assert.equal(formOf(app).props.mode, "memo");
  assert.equal(formOf(app).props.layout, "wide");
  assert.deepEqual(formOf(app).props.preset, {}, "메모로 열어도 연락 기록 쪽은 빈 폼이다");
  // R · 연락 기록 버튼은 지금처럼 연락 기록 모드로 연다.
  drawerOf(app).props.onClose();
  app.render();
  openWide(app);
  assert.equal(formOf(app).props.mode, "contact");
});

test("render: saving a memo adds a 메모 row with its receipt and changes nothing else — no contact, no promise, no last-contact write", async () => {
  const reads = [];
  const entries = [];
  const app = mountCustomers({
    leads: renderLeads(),
    accounts: renderAccounts(),
    memoSearch: () => ({ status: "live", entries, refresh() {} }),
    fetch: async (url, init) => {
      reads.push([String(url), init?.method || "GET"]);
      return { ok: true, json: async () => ({ status: "live", activities: [{ id: "a1", type: "call", msg: "지난 통화", reaction: "positive", occurredAt: ago(2) }] }) };
    },
  });
  const listRow = () => app.text(rowsOf(app).find((row) => row.props["data-customer-row"] === `lead:${LEAD_A}`));
  const before = listRow();
  openLeadA(app);
  app.runEffects(isActivityRead);
  await settle();
  app.render();
  memoButtonOf(app).props.onClick();
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.id), ["a1"]);
  const promiseBefore = columnOf(app).props.promise;

  // 메모 칸이 서버의 답을 받은 메모를 넘긴다(그 전에는 아무 줄도 서지 않는다 — 메모에는 낙관 줄이 없다).
  const NOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  memoPaneOf(app).props.onSaved({ id: NOTE, title: "", body: "원장님은 숫자로 설명해야 움직이심\n매일 쓸 사람은 부원장", occurredAt: new Date().toISOString(), revision: 1 });
  app.render();
  const rows = columnOf(app).props.rows;
  assert.deepEqual(rows.map((row) => [row.id, row.source, row.type]), [[`memo:${NOTE}`, "memo", "memo"], ["a1", "activity", "call"]], "방금 남긴 메모가 맨 윗줄");
  const [line] = recordContext.recordContextRows(rows);
  assert.deepEqual([line.shape, line.typeLabel, line.note, line.receipt.label, line.lineCount], ["memo", "메모", "연락 아님", "저장됨", 2]);
  assert.match(line.receipt.time, /^\d{2}:\d{2}$/);
  // 거르기 — 연락에는 통화만, 메모에는 방금 남긴 메모만.
  assert.deepEqual(recordContext.filterRecordStream(rows, "contact").map((row) => row.id), ["a1"]);
  assert.deepEqual(recordContext.filterRecordStream(rows, "memo").map((row) => row.id), [`memo:${NOTE}`]);

  // 메모는 연락이 아니다 — 고객 행 쓰기(약속 · 마지막 연락)도, 활동 쓰기도, 연락 기록 RPC도 나가지 않았다.
  assert.deepEqual(app.saves, [], "saveRevenueRecord(lead update · activity create)를 부르지 않는다");
  assert.deepEqual(reads, [[`/api/hub/revenue/activity?leadId=${LEAD_A}`, "GET"]], "이 화면에서 나간 요청은 처음의 활동 읽기 하나뿐");
  assert.deepEqual(columnOf(app).props.promise, promiseBefore, "다음 약속은 그대로");
  assert.equal(listRow(), before, "목록의 약속 · 마지막 연락도 그대로");
  // 창은 그대로다 — 메모 모드에 머물러 다음 메모를 이어 쓴다(연락 기록처럼 480px로 돌아가지 않는다).
  assert.equal(drawerOf(app).props.title, "메모");
  assert.equal(drawerOf(app).props.width, WIDE_WIDTH);

  // 다시 읽기가 같은 메모를 가져와도 두 줄이 되지 않고, 영수증은 남는다.
  entries.push({ id: NOTE, title: "", excerpt: "원장님은 숫자로 설명해야 움직이심…", occurredAt: new Date().toISOString() });
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.id), [`memo:${NOTE}`, "a1"]);
  assert.equal(contactRecord.recordReceipt(columnOf(app).props.rows[0]).label, "저장됨");
  // 쉬는 드로어의 기록 줄에도 같은 메모가 같은 영수증으로 선다(열면 메모 창).
  drawerOf(app).props.onClose();
  app.render();
  const timeline = app.findAll((n) => n.type === "ol" && n.props.className === "customer-tl")[0];
  const receipts = app.findAll((n) => n.type === "RecordReceipt", timeline).map((n) => n.props.receipt.label);
  assert.deepEqual(receipts, ["저장됨"]);
  assert.match(app.text(timeline), /원장님은 숫자로 설명해야 움직이심/);
  // id 없는 답은 줄로 세우지 않는다.
  memoButtonOf(app).props.onClick();
  app.render();
  memoPaneOf(app).props.onSaved({ body: "id 없는 답" });
  memoPaneOf(app).props.onSaved(null);
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.id), [`memo:${NOTE}`, "a1"]);
});

test("render: a memo saved here and then edited in the memo drawer shows the edit — the first snapshot never hides a newer save", async () => {
  const NOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const at = new Date().toISOString();
  const entries = [];
  const app = mountCustomers({
    leads: renderLeads(),
    accounts: renderAccounts(),
    memoSearch: () => ({ status: "live", entries, refresh() {} }),
    fetch: async () => ({ ok: true, json: async () => ({ status: "live", activities: [] }) }),
  });
  openLeadA(app);
  app.runEffects(isActivityRead);
  await settle();
  app.render();
  memoButtonOf(app).props.onClick();
  app.render();
  memoPaneOf(app).props.onSaved({ id: NOTE, title: "", body: "결정은 부원장", occurredAt: at, revision: 1 });
  app.render();
  assert.deepEqual(columnOf(app).props.rows.map((row) => row.msg), ["결정은 부원장"]);

  // 쉬는 드로어로 돌아가 그 메모를 연다 — 메모 창이 이 드로어를 대신한다(제목 · 태그 · 본문을 고치는 길).
  drawerOf(app).props.onClose();
  app.render();
  const timelineOf = () => app.findAll((n) => n.type === "ol" && n.props.className === "customer-tl")[0];
  app.findAll((n) => n.type === "button" && /customer-tl__body--link/.test(n.props.className || ""), timelineOf())[0].props.onClick();
  app.render();
  const memoDrawer = app.findAll((n) => n.type === "ContextMemoDrawer")[0];
  assert.equal(memoDrawer.props.noteId, NOTE);
  assert.equal(typeof memoDrawer.props.onSaved, "function", "메모 창의 저장 확인을 이 드로어가 듣는다");

  // 메모 창이 고친 글의 저장을 확인받았다 — 다시 읽기가 닿기 전에도 기록 줄은 고친 글이다(줄은 늘지 않는다).
  memoDrawer.props.onSaved({ id: NOTE, title: "결정권", body: "결정은 원장님이 직접 (부원장 아님)", occurredAt: at, revision: 2 });
  memoDrawer.props.onClose();
  app.render();
  assert.equal(app.findAll((n) => n.type === "ContextMemoDrawer").length, 0);
  const lines = () => app.findAll((n) => n.type === "li", timelineOf()).map((li) => app.text(li));
  assert.equal(lines().length, 1);
  assert.match(lines()[0], /^결정권결정은 원장님이 직접 \(부원장 아님\)메모연락 아님/);
  assert.doesNotMatch(lines()[0], /결정은 부원장/);
  assert.deepEqual(app.findAll((n) => n.type === "RecordReceipt", timelineOf()).map((n) => n.props.receipt.label), ["저장됨"]);

  // 늦게 닿은 옛 읽기(판 1)는 새 글을 되돌리지 않고, 다른 창에서 더 새로 고친 판(3)은 읽어 온 글이 이긴다.
  entries.push({ id: NOTE, title: "", excerpt: "결정은 부원장", occurredAt: at, revision: 1 });
  app.render();
  assert.match(lines()[0], /^결정권결정은 원장님이 직접/);
  entries[0] = { id: NOTE, title: "결정권 (확인)", excerpt: "원장님 확인 받음", occurredAt: at, revision: 3 };
  app.render();
  assert.match(lines()[0], /^결정권 \(확인\)원장님 확인 받음메모연락 아님/);

  // 이 창이 남기지 않은 옛 메모를 메모 창에서 고쳐도 영수증 줄이 새로 생기지 않는다(다시 읽기가 가져온다).
  const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  app.findAll((n) => n.type === "button" && /customer-tl__body--link/.test(n.props.className || ""), timelineOf())[0].props.onClick();
  app.render();
  app.findAll((n) => n.type === "ContextMemoDrawer")[0].props.onSaved({ id: OTHER, title: "", body: "옛 메모를 고침", occurredAt: at, revision: 7 });
  app.findAll((n) => n.type === "ContextMemoDrawer")[0].props.onClose();
  app.render();
  assert.equal(lines().length, 1);
  // 메모 창의 저장은 메모만 바꾼다 — 고객 행 · 활동을 쓰지 않는다.
  assert.deepEqual(app.saves, []);
});

test("render: the resting 기록 list names a memo the way the wide window does — a square marker and 메모 · 연락 아님, never 노트", () => {
  const app = mountCustomers();
  const today = new Date();
  const rows = [
    { id: "a1", source: "activity", type: "call", msg: "견적 검토 통화", reaction: "positive", occurredAt: ago(1) },
    { id: "memo:1", noteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", source: "memo", type: "memo", msg: "원장님 성향", occurredAt: ago(2) },
    { id: "n1", source: "activity", type: "note", msg: "연락이 아닌 한 줄", occurredAt: ago(3) },
  ];
  const timeline = app.renderTimeline({ rows, today, onDeleteActivity() {}, onOpenMemo() {} });
  const items = app.findAll((n) => n.type === "li", timeline);
  assert.deepEqual(items.map((li) => li.props["data-shape"]), ["contact", "memo", "memo"]);
  // 연결 메모와 활동 노트는 같은 이름이다 — 넓은 기록창의 읽기 칸과 한 드로어 안에서 두 이름으로 서지 않는다.
  assert.match(app.text(items[1]), /^원장님 성향메모연락 아님/);
  assert.match(app.text(items[2]), /^연락이 아닌 한 줄메모연락 아님/);
  assert.match(app.text(items[0]), /^견적 검토 통화통화긍정/);
  assert.doesNotMatch(app.text(items[0]), /메모|연락 아님/);
  assert.doesNotMatch(app.text(timeline), /노트/);
  // 같은 규칙에서 나온다(읽기 칸의 줄과 같은 함수) — 모양은 모서리와 면뿐, 색으로 나누지 않는다.
  const timelineSource = slice("function ActivityTimeline", "// 빠른 기록은 메모 전용이다");
  assert.match(timelineSource, /const kind = recordRowKind\(a\);/);
  assert.match(timelineSource, /<li key=\{a\.id \|\| i\} className="customer-tl__item" data-shape=\{kind\.shape\}>/);
  assert.doesNotMatch(customersSource, /ACT_LABEL\[/);
  const memoRule = cssSource.match(/\.hub-app \.customer-tl__item\[data-shape="memo"\] \.customer-tl__dot \{[^}]*\}/)?.[0] || "";
  assert.match(memoRule, /border-radius: var\(--r-xs\); background: var\(--surface-2\); \}$/);
  assert.doesNotMatch(memoRule, /--accent|--moon|--danger|--success|--warning|--info|--personal|--company/);
});

test("render: a customer a memo cannot be linked to keeps today's paths — QuickLog in the wide window, the memo drawer from 메모", () => {
  // 일지 메모 문맥은 uuid만 받는다 — uuid가 아닌 고객에는 메모 모드를 열지 않는다(연결 없는 메모를 만들지 않는다).
  const legacy = { id: "lead-legacy-7", name: "옛날학원 G", stage: "Contact", nextAction: "안부 전화", nextActionAt: dayKey(2), createdAt: ago(20), lastContactAt: ago(4) };
  const app = mountCustomers({ leads: [legacy] });
  rowsOf(app)[0].props.onClick();
  app.render();
  openWide(app);
  const form = formOf(app);
  assert.equal(form.props.layout, "wide");
  assert.equal(form.props.memo, null, "전환 칸이 서지 않는다");
  assert.equal(form.props.mode, "contact");
  assert.equal(app.findAll((n) => n.type === "details", form).length, 1);
  assert.match(app.text(form), /연락이 아닌 한 줄 메모/);
  // 메모 버튼은 지금처럼 메모 창을 연다.
  drawerOf(app).props.onClose();
  app.render();
  memoButtonOf(app).props.onClick();
  app.render();
  assert.equal(app.findAll((n) => n.type === "ContextMemoDrawer").length, 1);
  assert.equal(app.findAll((n) => n.type === "ContactRecordForm").length, 0);
});

test("render: on a phone 메모 opens the same sheet in memo mode — the memo drawer and QuickLog are gone for linkable customers", () => {
  atWidth(390, () => {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    memoButtonOf(app).props.onClick();
    app.render();
    // 드로어를 메모 창으로 바꾸지 않는다 — 같은 시트가 메모 모드로 선다.
    assert.equal(app.findAll((n) => n.type === "ContextMemoDrawer").length, 0);
    assert.equal(app.findAll((n) => n.type === "Drawer").length, 1);
    assert.equal(drawerOf(app).props.title, "메모");
    assert.equal(drawerOf(app).props.sheet, "full");
    assert.equal(formOf(app).props.layout, "sheet");
    assert.equal(formOf(app).props.mode, "memo");
    assert.equal(typeof formOf(app).props.memo, "function");
    // 메모 칸은 폼이 넘긴 자리(머리 저장 · 흐르는 칸 맨 위 · 가려진 동안의 줄)를 그대로 받는다.
    const given = { saveRef: { current: null }, contactLine: null, sheet: true, head: "전환 칸", saveSlot: { nodeType: 1 }, away: true, onReturn() {}, onAttention() {} };
    const pane = memoPaneOf(app, given);
    assert.equal(pane.type, "RecordMemoPane");
    for (const key of ["sheet", "head", "saveSlot", "away", "onReturn", "onAttention", "saveRef"]) assert.equal(pane.props[key], given[key], key);
    assert.deepEqual(pane.props.contexts, [{ type: "lead", id: LEAD_A, label: "테스트학원 A" }]);
    // 연락이 아닌 한 줄 메모(QuickLog)는 없다 — 메모 모드가 대신한다.
    assert.equal(app.findAll((n) => n.type === "details" && /연락이 아닌 한 줄 메모/.test(app.text(n))).length, 0);
    // 연락 기록으로 열어도 같은 시트에 전환 칸이 선다.
    drawerOf(app).props.onClose();
    app.render();
    openWide(app);
    assert.equal(formOf(app).props.mode, "contact");
    assert.equal(typeof formOf(app).props.memo, "function");
    assert.equal(app.findAll((n) => n.type === "details" && /연락이 아닌 한 줄 메모/.test(app.text(n))).length, 0);
  });
});

test("render: on a phone a customer a memo cannot be linked to keeps QuickLog inside the form's flow and the memo drawer", () => {
  atWidth(390, () => {
    const legacy = { id: "lead-legacy-7", name: "옛날학원 G", stage: "Contact", nextAction: "안부 전화", nextActionAt: dayKey(2), createdAt: ago(20), lastContactAt: ago(4) };
    const app = mountCustomers({ leads: [legacy] });
    rowsOf(app)[0].props.onClick();
    app.render();
    openWide(app);
    const form = formOf(app);
    assert.equal(form.props.layout, "sheet");
    assert.equal(form.props.memo, null);
    // 한 줄 메모는 폼의 자식(흐르는 칸 안)이다 — 폼 밖에 따로 서지 않는다(맨 아래는 칩 줄 자리).
    assert.equal(app.findAll((n) => n.type === "details", form).length, 1);
    assert.equal(app.findAll((n) => n.type === "details").length, 1);
    drawerOf(app).props.onClose();
    app.render();
    memoButtonOf(app).props.onClick();
    app.render();
    assert.equal(app.findAll((n) => n.type === "ContextMemoDrawer").length, 1);
  });
});

test("memo mode writes through the journal only and QuickLog stays for the paths that still need it", () => {
  const drawer = slice("function Customer360Drawer", "// ── 새 고객 등록");
  // 메모 모드는 기록창(어느 화면 폭이든) + 메모를 붙일 수 있는 고객에서만.
  assert.match(drawer, /const recording = Boolean\(record\);/);
  assert.match(drawer, /const memoModeAvailable = recording && memoEnabled;\s*const memoMode = memoModeAvailable && record\.mode === "memo";/);
  assert.match(drawer, /const quickMemo = record && !memoModeAvailable && \(/);
  assert.match(drawer, /memo=\{memoPane\}/);
  // 메모 칸의 저장 확인은 기록 줄기에 줄을 세울 뿐이다 — 활동 · 고객 행 · 연락 확인 토스트를 건드리지 않는다.
  const pane = drawer.slice(drawer.indexOf("const memoPane ="), drawer.indexOf("const recordForm ="));
  assert.match(pane, /onSaved=\{\(entry\) => setSavedMemos\(prev => upsertSavedMemo\(prev, entry, stamp\(\)\)\)\}/);
  assert.doesNotMatch(pane, /setActivities|saveRevenueRecord|logActivity|onRecordPersisted|onPromiseSaved|next_action/);
  // 줄기는 읽어 온 메모 + 방금 저장이 확인된 메모 — 메모 읽기가 실패해도 방금 저장한 메모는 선다.
  assert.match(drawer, /const notes = memoEnabled \? memoStreamRows\(memos\.status === "live" \? memos\.entries : \[\], savedMemos\) : \[\];/);
  // 메모 버튼 — 같은 드로어가 메모 모드로 열린다(휴대폰도 같은 시트). 메모를 붙일 수 없는 고객만 메모 창.
  assert.match(drawer, /onClick=\{\(\) => \(memoEnabled \? startRecord\(\{\}, null, "", "memo"\) : setMemoState\(\{\}\)\)\}>메모<\/Button>/);
  // 한 줄 메모는 폼의 흐르는 칸에만 놓인다 — 폼 밖에 따로 서던 자리(옛 바닥 시트)는 없다.
  assert.match(drawer, />\s*\{quickMemo\}\s*<\/ContactRecordForm>/);
  assert.equal((drawer.match(/\{quickMemo\}/g) || []).length, 1);
});

test("render: a just-saved record row carries a receipt — 기록 중 → 저장 중 → 저장됨 only after the server answers", () => {
  const app = mountCustomers();
  const today = new Date();
  const row = { id: "local-1", source: "activity", type: "call", msg: "견적 검토 통화", reaction: "positive", at: "방금", occurredAt: today.toISOString() };
  const deleteButtons = (tree) => app.findAll((n) => n.type === "IconButton" && n.props["aria-label"] === "기록 삭제", tree);
  const receiptOf = (tree) => app.findAll((n) => n.type === "RecordReceipt", tree).map((n) => n.props.receipt);

  // 저장을 눌렀지만 되돌리기 창이다 — 아직 보내지 않았다. 시각 자리에 영수증이 선다.
  const pending = app.renderTimeline({ rows: [{ ...row, pending: true }], today, onDeleteActivity() {} });
  assert.deepEqual(receiptOf(pending).map((r) => [r.phase, r.label, r.detail]), [["pending", "기록 중", "아직 보내지 않았어요"]]);
  assert.match(app.text(pending), /견적 검토 통화.*통화.*긍정$/);
  assert.doesNotMatch(app.text(pending), /오늘|방금|기록됨|저장됨/, "확인되지 않은 기록에 시각·완료 문구를 달지 않는다");
  assert.equal(deleteButtons(pending).length, 0);

  // 되돌리기 창이 닫혀 요청이 나갔다 — 같은 줄이 "저장 중"이 된다(아직 시각 없음).
  const sending = app.renderTimeline({ rows: contactRecord.applyReceiptEvent([{ ...row, pending: true }], { type: "sending", optimisticId: "local-1" }), today, onDeleteActivity() {} });
  assert.deepEqual(receiptOf(sending).map((r) => [r.phase, r.label, r.time]), [["sending", "저장 중", ""]]);
  assert.doesNotMatch(app.text(sending), /오늘|방금|저장됨/);

  // 서버가 저장을 확인한 뒤에만 "저장됨 hh:mm"이 서고 삭제할 수 있게 된다.
  const savedRows = contactRecord.applyReceiptEvent(
    [{ ...row, id: "99999999-9999-4999-8999-999999999999", pending: false, receipt: "sending" }],
    { type: "saved", activityId: "99999999-9999-4999-8999-999999999999", optimisticId: "local-1", at: "2026-09-30T01:42:00.000Z" },
  );
  const saved = app.renderTimeline({ rows: savedRows, today, onDeleteActivity() {} });
  assert.deepEqual(receiptOf(saved).map((r) => [r.phase, r.label, r.time]), [["saved", "저장됨", "10:42"]]);
  assert.equal(deleteButtons(saved).length, 1);

  // 읽어 온 기록(영수증 없음)은 지금처럼 시각을 보인다.
  const stored = app.renderTimeline({ rows: [{ ...row, id: "99999999-9999-4999-8999-999999999999" }], today, onDeleteActivity() {} });
  assert.equal(receiptOf(stored).length, 0);
  assert.match(app.text(stored), /긍정오늘$/);

  // 낙관 행은 폼이 저장을 누른 순간 pending으로 들어오고(되돌리기 창 = 기록 중), 빠른 메모는 되돌리기
  // 창 없이 바로 보내므로 "저장 중"으로 들어와 서버가 답하면 "저장됨"으로 풀린다.
  const drawer = slice("function Customer360Drawer", "// ── 새 고객 등록");
  assert.match(drawer, /onSaved=\{\(o\) => \{[\s\S]*?occurredAt: new Date\(\)\.toISOString\(\), pending: true \},/);
  assert.match(drawer, /const temp = \{ id: `local-\$\{Date\.now\(\)\}`, type, msg: body, at: "방금", pending: Boolean\(row\.id\), receipt: row\.id \? "sending" : null \};/);
  assert.match(drawer, /a\.id === temp\.id \? \{ \.\.\.a, id: r\.id, pending: false, receipt: "saved", savedAt: new Date\(\)\.toISOString\(\) \} : a/);
  // 기록창의 저장 사건이 기록 줄 영수증으로 이어진다 — 저장됨은 onPersisted(자세히까지 확인) 뒤에만.
  assert.match(drawer, /onSending=\{\(\{ optimisticId \}\) => setActivities\(prev => applyReceiptEvent\(prev, \{ type: "sending", optimisticId \}\)\)\}/);
  assert.match(drawer, /onPartial=\{[\s\S]*?applyReceiptEvent\(prev, \{ type: "partial", activityId, optimisticId, at: stamp\(\) \}\)/);
  const persisted = drawer.slice(drawer.indexOf("onPersisted={"), drawer.indexOf("onFailed={"));
  assert.match(persisted, /const at = stamp\(\);\s*setActivities\(prev => addSavedNoteRow\(applyReceiptEvent\(prev, \{ type: "saved", activityId, optimisticId, at \}\), note, at\)\);/);
  assert.match(persisted, /onRecordPersisted\?\.\(row\);/);
  assert.doesNotMatch(drawer.slice(drawer.indexOf("onSummaryPersisted={"), drawer.indexOf("onPartial={")), /receipt: "saved"|type: "saved"/, "요약만 확인된 시점에 저장됨을 말하지 않는다");
});

test("render: a stored-fact recommendation takes the rotating card's place and asks through this drawer's own question", () => {
  const company = { ...renderLeads()[0], workspace: "classin", type: "company" };
  const recommendation = {
    id: `positive-no-date:lead:${company.id}`, ruleId: "positive-no-date", cardId: "sales-voss-feasibility", severity: "act", basis: "record",
    subject: { type: "lead", id: company.id, name: company.name, lane: "classin", laneBlocked: false },
    facts: ["9/20 통화 · 긍정 반응", "날짜 정한 다음 단계 없음"],
  };
  const app = mountCustomers({ leads: [company], params: "scope=classin", guruRecommendations: [recommendation] });
  rowsOf(app)[0].props.onClick();
  app.render();
  const shown = app.findAll((n) => n.type === "GuruRecommendation");
  assert.equal(shown.length, 1);
  assert.equal(shown[0].props.recommendation.id, recommendation.id);
  assert.equal(app.findAll((n) => n.type === "GuruGuidanceCard").length, 0, "the rotating card is the fallback only");
  assert.match(app.text(), /기록 기반 추천 있음/);
  shown[0].props.onAsk(GURU_CARDS.find((card) => card.id === "sales-voss-feasibility"));
  app.render();
  const question = app.findAll((n) => n.type === "GuidanceQuestionDrawer")[0];
  assert.equal(question.props.card.id, "sales-voss-feasibility");
  assert.equal(question.props.context.ref, company.id);

  // 다른 고객의 추천은 이 드로어에 붙지 않고, 순환 카드가 그대로 남는다.
  const other = mountCustomers({ leads: [company], params: "scope=classin", guruRecommendations: [{ ...recommendation, subject: { ...recommendation.subject, id: "someone-else" } }] });
  rowsOf(other)[0].props.onClick();
  other.render();
  assert.equal(other.findAll((n) => n.type === "GuruRecommendation").length, 0);
  assert.equal(other.findAll((n) => n.type === "GuruGuidanceCard").length, 1);

  // ClassIn 범위 화면이 아니면 추천을 읽을 수만 있다(질문은 ClassIn 화면·ClassIn 고객일 때만).
  const allApp = mountCustomers({ leads: [company], params: "scope=all", guruRecommendations: [recommendation] });
  rowsOf(allApp)[0].props.onClick();
  allApp.render();
  assert.equal(allApp.findAll((n) => n.type === "GuruRecommendation")[0].props.onAsk, undefined);
});

// 2026-09-24: 이관·시트 템플릿 문구는 운영자의 약속이 아니다 — 목록·드로어 둘 다 "다음 약속
// 없음"으로 말하고, 문구는 SuggestionTip의 제안으로만 낸다(한 사람당 팁 하나).
test("render: a template next action never shows as a real promise — it's a suggestion tip instead", () => {
  const TEMPLATE = "고객 활성 상태 확인 → 갱신·휴면 여부 정리";
  const templated = {
    id: "66666666-6666-4666-8666-666666666666",
    name: "템플릿학원 F",
    stage: "Contact",
    nextAction: TEMPLATE,
    nextActionIsTemplate: true,
    createdAt: ago(10),
    lastContactAt: ago(10),
  };
  const app = mountCustomers({ leads: [templated] });
  const row = rowsOf(app)[0];
  assert.match(app.text(row), /다음 약속 없음/);
  assert.doesNotMatch(app.text(row), new RegExp(TEMPLATE), "템플릿 문구를 진짜 약속처럼 행에 보여주지 않는다");

  const cellTip = app.findAll((n) => n.type === "SuggestionTip" && n.props.compact)[0];
  assert.ok(cellTip, "고객 목록 행은 compact 제안 팁을 낸다");
  assert.equal(cellTip.props.reason, TEMPLATE);
  assert.equal(app.findAll((n) => n.type === "SuggestionTip").length, 1, "한 사람당 팁은 하나");

  rowsOf(app)[0].props.onClick();
  app.render();
  const promise = app.findAll((n) => n.props?.["aria-label"] === "다음 약속")[0];
  assert.match(app.text(promise), /다음 약속 없음/);
  const fullTip = app.findAll((n) => n.type === "SuggestionTip" && !n.props.compact)[0];
  assert.ok(fullTip, "드로어는 버튼이 붙은 전체 제안 팁을 낸다");
  assert.equal(fullTip.props.reason, TEMPLATE);
  assert.equal(fullTip.props.action, "약속으로 정하기");
  // 카드 자체의 "약속 정하기" 제네릭 버튼은 없다 — 팁의 버튼이 같은 역할을 한다(중복 없음).
  assert.equal(app.findAll((n) => n.type === "Button" && /약속 정하기/.test(app.text(n))).length, 0);

  fullTip.props.onAction();
  app.render();
  const editorInput = app.findAll((n) => n.type === "TextField" && n.props.label === "무엇을")[0];
  assert.equal(editorInput.props.value, TEMPLATE, "제안을 누르면 그 문구가 그대로 편집 칸에 들어간다");
});

test("render: customer Guru is readable across scopes but asks only for a ClassIn customer in the ClassIn scope", () => {
  const personal = { ...renderLeads()[0], workspace: "brand", type: "personal" };
  const personalApp = mountCustomers({ leads: [personal], params: "scope=personal" });
  rowsOf(personalApp)[0].props.onClick();
  personalApp.render();
  const personalCard = personalApp.findAll((n) => n.type === "GuruGuidanceCard")[0];
  assert.ok(personalCard, "the source-backed card remains readable");
  assert.equal(personalCard.props.onAsk, undefined);
  assert.equal(personalApp.findAll((n) => n.type === "OfficeWorkflowPanel")[0].props.scope, "personal");
  assert.equal(personalApp.findAll((n) => n.type === "FloatingMentorWidget").length, 0);
  assert.equal(personalApp.findAll((n) => n.type === "GuidanceQuestionDrawer").length, 0);

  const company = { ...renderLeads()[0], workspace: "classin", type: "company" };
  const allApp = mountCustomers({ leads: [company], params: "scope=all" });
  rowsOf(allApp)[0].props.onClick();
  allApp.render();
  assert.equal(allApp.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk, undefined);

  const classinApp = mountCustomers({ leads: [company], params: "scope=classin" });
  rowsOf(classinApp)[0].props.onClick();
  classinApp.render();
  const classinCard = classinApp.findAll((n) => n.type === "GuruGuidanceCard")[0];
  assert.equal(typeof classinCard.props.onAsk, "function");
  assert.equal(classinApp.findAll((n) => n.type === "OfficeWorkflowPanel")[0].props.scope, "classin");
  classinCard.props.onAsk(GURU_CARDS.find((card) => card.id === "sales-gap"));
  classinApp.render();
  const question = classinApp.findAll((n) => n.type === "GuidanceQuestionDrawer")[0];
  assert.ok(question);
  assert.equal(question.props.card.id, "sales-gap");
  assert.equal(question.props.context.ref, company.id);
  assert.equal(classinApp.findAll((n) => n.type === "FloatingMentorWidget").length, 0);

  const mislabeledPersonal = { ...personal, workspace: "classin" };
  const inconsistentApp = mountCustomers({ leads: [mislabeledPersonal], params: "scope=classin" });
  rowsOf(inconsistentApp)[0].props.onClick();
  inconsistentApp.render();
  assert.equal(inconsistentApp.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk, undefined);
  assert.equal(inconsistentApp.findAll((n) => n.type === "OfficeWorkflowPanel").length, 0);
  assert.ok(inconsistentApp.findAll((n) => n.props?.role === "status" && /고객 소속/.test(inconsistentApp.text(n))).length);

  const conflictingCompany = { ...company, workspace: "brand" };
  const companyConflictApp = mountCustomers({ leads: [conflictingCompany], params: "scope=classin" });
  rowsOf(companyConflictApp)[0].props.onClick();
  companyConflictApp.render();
  assert.equal(companyConflictApp.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk, undefined);
  assert.equal(companyConflictApp.findAll((n) => n.type === "OfficeWorkflowPanel").length, 0);

  const taggedAccount = { ...renderAccounts()[0], workspace: "classin" };
  const accountApp = mountCustomers({ accounts: [taggedAccount], params: "scope=classin" });
  const segments = accountApp.findAll((n) => n.type === "SegmentedControl" && n.props.label === "고객 구분")[0];
  segments.props.onChange("won");
  accountApp.render();
  rowsOf(accountApp)[0].props.onClick();
  accountApp.render();
  assert.equal(typeof accountApp.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk, "function");

  const unknownApp = mountCustomers({ leads: [renderLeads()[0]], params: "scope=all" });
  rowsOf(unknownApp)[0].props.onClick();
  unknownApp.render();
  assert.equal(unknownApp.findAll((n) => n.type === "OfficeWorkflowPanel")[0].props.scope, null);
  assert.equal(unknownApp.findAll((n) => n.props?.role === "status" && /고객 소속/.test(unknownApp.text(n))).length, 0);
});

test("render: explicit brand ownership must agree with company type before customer advice uses ClassIn", () => {
  const openedClassinRecord = (record, kind) => {
    const app = mountCustomers({
      [kind === "account" ? "accounts" : "leads"]: [record],
      params: "scope=classin",
    });
    if (kind === "account") {
      const segments = app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "고객 구분")[0];
      segments.props.onChange("won");
      app.render();
    }
    const row = rowsOf(app)[0];
    assert.ok(row, "company type keeps the row visible in the ClassIn list");
    row.props.onClick();
    app.render();
    return {
      card: app.findAll((n) => n.type === "GuruGuidanceCard")[0],
      office: app.findAll((n) => n.type === "OfficeWorkflowPanel")[0],
    };
  };

  for (const [kind, record] of [
    ["lead", { ...renderLeads()[0], workspace: null, type: "company", brand: "sinabro" }],
    ["account", { ...renderAccounts()[0], workspace: null, type: "company", brand: "sinabro" }],
  ]) {
    const { card, office } = openedClassinRecord(record, kind);
    assert.equal(card.props.onAsk, undefined, `${kind} Guru must not send personal-brand details to ClassIn`);
    assert.equal(office, undefined, `${kind} Office must not generate from conflicting ownership`);
  }

  const classinBrand = { ...renderLeads()[0], workspace: null, type: "company", brand: "classmoon" };
  const { card, office } = openedClassinRecord(classinBrand, "lead");
  assert.equal(typeof card.props.onAsk, "function");
  assert.equal(office.props.scope, "classin");
});

// 2026-09-25: 고객 상세의 Guru는 deal-review 위젯이었다. 리드·계정 id는 거래 초점으로 풀리지
// 않았고(focus 없음), 대화 매 턴 Engine이 project_updates 행을 남겼다(open-question 외 모드).
test("render: customer Guru asks the open-question path with this record's id and visible facts", () => {
  const company = {
    ...renderLeads()[0], workspace: "classin", type: "company", region: "서울",
    contactName: "김원장", contactPhone: "010-1234-5678", contactEmail: "kim@academy.kr",
  };
  const app = mountCustomers({ leads: [company], params: "scope=classin" });
  rowsOf(app)[0].props.onClick();
  app.render();
  const card = GURU_CARDS.find((item) => item.id === "sales-gap");
  app.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk(card);
  app.render();

  assert.equal(app.findAll((n) => n.type === "FloatingMentorWidget").length, 0, "no deal-review widget from customer detail");
  const questions = app.findAll((n) => n.type === "GuidanceQuestionDrawer");
  assert.equal(questions.length, 1);
  // 활성 오버레이는 하나 — 질문 드로어가 고객 드로어를 대신하고, 닫으면 같은 고객으로 돌아온다.
  assert.equal(app.findAll((n) => n.type === "Drawer").length, 0);
  const { card: asked, context } = questions[0].props;
  assert.equal(asked.id, "sales-gap");
  assert.equal(context.ref, company.id);
  assert.equal(context.label, "김원장 · 테스트학원 A");
  assert.deepEqual(context.facts, [
    "고객: 김원장",
    "소속: 테스트학원 A",
    "구분: 리드",
    "단계: 연락 중",
    "다음 약속: 견적서 보내기 · 2일 지남",
    "마지막 연락: 긍정 · 5일 전",
    "분류: 서울",
  ]);

  // 실제 질문 경로로 보낼 요청 — open-question(Engine이 project_updates를 쓰지 않는 모드),
  // 레코드 id를 ref로, 화면의 사실만. 연락처는 조언에 필요 없어 보내지 않는다.
  const request = guidanceRequest(asked, "무엇을 먼저 확인할까?", context);
  assert.equal(request.endpoint, "/api/hub/sales-mentor");
  assert.equal(request.body.mode, "open-question");
  assert.equal(request.body.ref, company.id);
  assert.equal(request.body.guidanceId, "sales-gap");
  assert.match(request.body.draft, /- 다음 약속: 견적서 보내기 · 2일 지남/);
  assert.match(request.body.draft, /무엇을 먼저 확인할까\?$/);
  assert.doesNotMatch(request.body.draft, /010-1234-5678|kim@academy\.kr/);

  questions[0].props.onClose();
  app.render();
  assert.equal(app.findAll((n) => n.type === "GuidanceQuestionDrawer").length, 0);
  assert.equal(app.findAll((n) => n.type === "Drawer")[0].props.title, "김원장");
});

test("render: customer Guru closes without a stored record id", () => {
  const unsaved = { ...renderAccounts()[0], id: null, workspace: "classin", type: "company" };
  const app = mountCustomers({ accounts: [unsaved], params: "scope=classin" });
  app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "고객 구분")[0].props.onChange("won");
  app.render();
  rowsOf(app)[0].props.onClick();
  app.render();
  assert.equal(app.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk, undefined);
});

test("render: an unsupported explicit workspace blocks customer advice despite company type", () => {
  for (const [kind, record] of [
    ["lead", { ...renderLeads()[0], workspace: "personal", type: "company" }],
    ["account", { ...renderAccounts()[0], workspace: "personal", type: "company" }],
  ]) {
    const app = mountCustomers({
      [kind === "account" ? "accounts" : "leads"]: [record],
      params: "scope=classin",
    });
    if (kind === "account") {
      const segments = app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "고객 구분")[0];
      segments.props.onChange("won");
      app.render();
    }
    rowsOf(app)[0].props.onClick();
    app.render();
    assert.equal(app.findAll((n) => n.type === "GuruGuidanceCard")[0].props.onAsk, undefined, kind);
    assert.equal(app.findAll((n) => n.type === "OfficeWorkflowPanel").length, 0, kind);
    assert.ok(app.findAll((n) => n.props?.role === "status" && /고객 소속/.test(app.text(n))).length, kind);
  }
});

test("render: 날짜 다시 moves only the promise date through the lead update route", async () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  rowsOf(app).find(row => row.props["data-customer-row"] === "lead:11111111-1111-4111-8111-111111111111").props.onClick();
  app.render();
  const button = (label) => app.findAll((n) => n.type === "Button" && app.text(n).trim() === label)[0];
  button("날짜 다시").props.onClick();
  app.render();
  const dateField = app.findAll((n) => n.type === "TextField" && n.props.label === "언제")[0];
  dateField.props.onChange({ target: { value: dayKey(3) } });
  app.render();
  await button("약속 저장").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(app.saves.at(-1), ["lead", "update", { id: "11111111-1111-4111-8111-111111111111", next_action_at: dayKey(3) }]);
});

test("drawer memo query uses a limit the journal search route accepts (3 or 40)", () => {
  // journal-search.js는 limit을 3·40만 받는다 — 다른 값이면 invalid-input이 돌아와 드로어 기록이
  // "연결 메모를 읽지 못했어요"로 떨어진다(2026-09-24 통합 검증에서 limit=5로 발견).
  const limits = [...customersSource.matchAll(/contextId:[^`]*`\)?\}&limit=(\d+)/g)].map((m) => m[1]);
  const all = [...customersSource.matchAll(/&limit=(\d+)/g)].map((m) => m[1]);
  assert.ok(all.length > 0, "memo query present");
  for (const value of [...limits, ...all]) assert.ok(["3", "40"].includes(value), `limit=${value}`);
});
