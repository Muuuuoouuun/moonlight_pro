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

test("the table has exactly five 3-state sortable columns, next promise ascending by default", () => {
  const head = slice('className="customers-grid customers-head"', "</div>");
  const heads = [...head.matchAll(/<SortHead k="(\w+)"[^>]*>([^<]+)<\/SortHead>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(heads, [["name", "고객"], ["phase", "단계"], ["promise", "다음 약속"], ["last", "마지막 연락"], ["value", "금액"]]);
  assert.match(customersSource, /React\.useState\(\{ key: "promise", dir: "asc" \}\)/);
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
  assert.match(card, /아직 정하지 않았어요/);
  assert.match(card, /약속 정하기/);
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
  // 늦은 실패는 폼이 사라졌어도 부모가 입력 그대로 다시 연다.
  assert.match(customersSource, /setRecordRequest\(\{ key: row\.key, draft: form, error: message \}\)/);
});

test("a persisted contact replaces its optimistic timeline ID so delete reaches the saved row", () => {
  const form = customersSource.slice(customersSource.indexOf("<ContactRecordForm"));
  assert.match(form, /onSummaryPersisted=\{\(\{\s*activityId,\s*optimisticId\s*\}\)/);
  assert.match(form, /a\.id === optimisticId \? \{ \.\.\.a, id: activityId \} : a/);
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

test("Customer360Drawer lets a reader request Guru after seeing a source-backed card", () => {
  assert.match(customersSource, /<GuruGuidanceCard domain="sales" compact onAsk=/);
  assert.match(customersSource, /setGuruQuestion\(''\)/, 'a card must open a blank operator question');
  assert.doesNotMatch(customersSource, /setGuruQuestion\(card\.question\)/);
  assert.match(customersSource, /guidanceId=\{guruGuidanceId\}/);
  assert.match(customersSource, /initialQuestion=\{guruQuestion\}/);
  assert.doesNotMatch(customersSource, /Guru 전략 코칭 \(⌘J\)/);
  assert.match(customersSource, /FloatingMentorWidget/);
  assert.match(customersSource, /agent="guru"/);
  assert.match(customersSource, /contextType="customer"/);
  // 적용한 문장은 표시 모델 키가 아니라 약속 쓰기 계약(next_action)으로 저장된다.
  assert.match(customersSource, /onApplyText=\{\(text\) => \{[\s\S]*?savePromise\(\{ what: text\.slice\(0, 100\) \}\)/);
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
const uuid = await import("../../../lib/uuid.js");
const workspaceMap = await import("../workspace-map.js");
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
];

function mountCustomers({ state = "live", leads = [], accounts = [], params = "" } = {}) {
  // 훅 상태는 컴포넌트 경로별로 둔다 — 드로어가 기록 모드로 바뀌면 자식 구성이 달라지므로
  // 전역 인덱스 하나로는 React처럼 인스턴스별 상태를 흉내 낼 수 없다.
  const slots = new Map();
  const saves = [];
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
    useEffect: () => {},
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
    useMemoSearch: () => ({ status: "live", entries: [], refresh() {} }),
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
    ...helpers,
    isTemplateNextAction: leadEnrichment.isTemplateNextAction,
    TIP_RULE_IDS: crmNudge.TIP_RULE_IDS,
    nudgeTipReason: crmNudge.nudgeTipReason,
    // 실제 훅은 fetch로 넛지를 읽는다 — 이 렌더 스모크는 이 화면의 목록·드로어 그리기만
    // 확인하므로 넛지 없는 정적 상태로 둔다(넛지 자체 계약은 crm-nudge.test.mjs가 고정).
    useCrmNudges: () => ({ status: "preview", nudges: [], unrecordedMeetings: [], failedSources: [], busyKey: null, suppress: async () => ({ ok: true }), refresh() {} }),
  };
  for (const name of HOST_COMPONENTS) deps[name] = name;
  const { Customers } = new Function(...Object.keys(deps), `${pageJs}; return { Customers };`)(...Object.values(deps));

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
  const render = () => { tree = expand(call(Customers, { onNavigate() {} }, "root"), "root"); return tree; };
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
  return { render, findAll, text, saves };
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

test("render: 진행 중 lists open customers by next promise, rails the overdue one, counts every segment", () => {
  const app = mountCustomers({ leads: renderLeads(), accounts: renderAccounts() });
  const rows = rowsOf(app);
  assert.deepEqual(rows.map((r) => r.props["data-customer-row"]), [
    "lead:11111111-1111-4111-8111-111111111111",
    "lead:22222222-2222-4222-8222-222222222222",
    "lead:33333333-3333-4333-8333-333333333333",
  ]);
  assert.equal(rows[0].props["data-urgent"], "true");
  assert.equal(rows[1].props["data-urgent"], undefined);
  assert.match(app.text(rows[0]), /2일 지남/);
  assert.match(app.text(rows[0]), /긍정5일 전/);
  assert.match(app.text(rows[1]), /오늘/);
  assert.match(app.text(rows[2]), /다음 약속 없음/);
  const seg = app.findAll((n) => n.type === "SegmentedControl" && n.props.label === "고객 구분")[0];
  assert.deepEqual(seg.props.options.map((o) => [o.key, o.count]), [["active", 3], ["won", 1], ["new", 1], ["dormant", 0], ["all", 5]]);
  assert.match(app.text(), /3명 표시/);
  assert.match(app.text(), /정렬: 다음 약속이 급한 순/);
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
  rowsOf(app)[0].props.onClick();
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
  classinCard.props.onAsk({ id: "sales-gap" });
  classinApp.render();
  const mentor = classinApp.findAll((n) => n.type === "FloatingMentorWidget")[0];
  assert.ok(mentor);
  assert.equal(mentor.props.agent, "guru");
  assert.equal(mentor.props.guidanceId, "sales-gap");

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
  rowsOf(app)[0].props.onClick();
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
