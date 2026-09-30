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
  assert.match(drawer, /title=\{record \? "연락 기록" : displayName\}/);
  assert.match(drawer, /onClose=\{record \? \(\) => setRecord\(null\) : onClose\}/);
  // 그릇은 같은 Drawer다 — 폭만 순수 규칙(recordWindowLayout)에서 받고, 새 presentation은 없다(Q-CR1).
  assert.match(drawer, /const recordLayout = recordWindowLayout\(\{ recording: Boolean\(record\), mobile \}\);/);
  assert.match(drawer, /presentation=\{mobile \? "compact" : "side"\}\s*width=\{recordLayout\.width\}/);
  assert.doesNotMatch(drawer, /presentation="(focus|wide)"/);
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
  "GuidanceQuestionDrawer", "GuruRecommendation", "RecordContextColumn", "RecordReceipt",
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
    ACT_ICON: recordContext.ACTIVITY_ICON,
    ACT_LABEL: recordContext.ACTIVITY_LABEL,
    recordContextTruth: recordContext.recordContextTruth,
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
  assert.deepEqual(column.props.truth, { state: "loading", reason: "", retry: null }, "활동 읽기가 끝나기 전");
  assert.equal(column.props.tipReason, "", "이 사람에게 고른 팁이 없으면 지어내지 않는다");
  assert.deepEqual(column.props.rows, []);
  assert.deepEqual(Object.keys(column.props).filter((key) => /^on[A-Z]/.test(key)), ["onRetry"]);

  // 쓰는 동안 쉬는 드로어의 본문(약속 카드 · 거래 · 정보)은 자리를 비키고, primary는 폼의 저장 하나다.
  assert.equal(app.findAll((n) => n.props?.className === "customer-focus").length, 0);
  assert.equal(app.findAll((n) => n.type === "Button" && n.props.variant === "primary" && /연락 기록/.test(app.text(n))).length, 0);
  // 연락이 아닌 한 줄 메모는 메모 모드가 합쳐질 때까지 폼의 흐르는 칸에 남는다(아래 띠가 맨 아래여야 해서).
  assert.equal(app.findAll((n) => n.type === "details", form).length, 1);
  assert.match(app.text(form), /연락이 아닌 한 줄 메모/);

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
  assert.deepEqual(column.props.truth, { state: "partial", reason: "연결 메모를 읽지 못했어요", retry: "memos" });
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
  assert.deepEqual(columnOf(failing).props.truth, { state: "error", reason: "활동 기록을 읽지 못했어요", retry: "activities" });
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

test("render: on a phone the record mode keeps today's bottom sheet — no wide window yet", () => {
  const had = Object.hasOwn(globalThis, "window");
  const before = globalThis.window;
  globalThis.window = { matchMedia: (query) => ({ matches: query === "(max-width: 600px)", addEventListener() {}, removeEventListener() {} }) };
  try {
    const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
    openLeadA(app);
    app.findAll((n) => n.type === "Button" && n.props.variant === "primary" && /연락 기록/.test(app.text(n)))[0].props.onClick();
    app.render();
    assert.equal(drawerOf(app).props.presentation, "compact");
    assert.equal(drawerOf(app).props.width, REST_WIDTH);
    assert.equal(drawerOf(app).props.bodyStyle, undefined);
    assert.equal(app.findAll((n) => n.type === "ContactRecordForm")[0].props.layout, "compact");
    assert.equal(app.findAll((n) => n.type === "RecordContextColumn").length, 0);
    // 한 줄 메모는 지금처럼 폼 아래(폼 밖)에 있다.
    const focus = app.findAll((n) => n.props?.className === "customer-focus")[0];
    assert.deepEqual(focus.props.children.map((child) => child.type), ["ContactRecordForm", "details"]);
  } finally {
    if (had) globalThis.window = before;
    else delete globalThis.window;
  }
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
