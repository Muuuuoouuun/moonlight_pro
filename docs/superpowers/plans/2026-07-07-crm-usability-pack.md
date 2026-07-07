# CRM 센스있는 사용성 팩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sensible-usability + CRM depth to the Hub Revenue surface — quick create/edit, keyboard + context menu + ⌘K actions, activity/follow-up card wiring, bulk actions + saved views — on top of existing infra with no migration.

**Architecture:** All work lives in `apps/hub` Revenue surface (`revenue.jsx` + write layer + follow-up/activity ledgers). A shared selection/keyboard hook is the substrate for context menus and bulk. Follow-up/activity logging reuses `getFollowups`/`recordActivity`/`outreach_outcomes`. Persistence extends `revenue-write.js` build mappers (no schema change — new fields land on existing columns or `meta`).

**Tech Stack:** Next.js App Router (client components), React, Supabase REST (via `lib/server-read`/`server-write`), Node `--test` for pure-logic self-tests.

**Verification model (codebase reality — no component test runner):**
- **Pure logic** (write mappers, snooze filter) → **`node --test apps/hub/lib/**/*.test.mjs`** (test-first).
- **Interaction UI** → **`npm run lint` + `npm run build`** gate + **preview 라이브 검증** (preview_start → interact → snapshot/inspect). Manual scenario listed per task.
- Each phase is independently shippable. Commit frequently. Local branch `real_v1`; push is manual (user rule).

**Spec:** `docs/superpowers/specs/2026-07-07-crm-usability-pack-design.md`

---

## File Structure

**Created:**
- `apps/hub/components/hub/use-crm-keyboard.js` — `useCrmSelection` (selected id/set + nav helpers) + `useCrmKeyboard` (scoped key handling). Substrate for Phase 2/4.
- `apps/hub/components/hub/crm-shortcut-overlay.jsx` — `?` help overlay (Kbd list).
- `apps/hub/components/hub/crm-context-menu.jsx` — `ContextMenu` (Phase 2, generalized from `ContactMenu`).
- `apps/hub/components/hub/crm-bulk-bar.jsx` — `BulkBar` + `SavedViews` (Phase 4).

**Modified:**
- `apps/hub/components/hub/pages/revenue.jsx` — Deals/Leads/Cases interactions, follow-up strip, bulk.
- `apps/hub/components/hub/hub-primitives.jsx` — `EditDrawer`/`Drawer` ⌘Enter+Esc (Phase 1).
- `apps/hub/lib/sales-os/revenue-write.js` — `buildLeadWrite`/`buildDealWrite` += next_action/snooze (Phase 3).
- `apps/hub/lib/repositories/followups-ledger.js` — snooze respect (Phase 3).
- `apps/hub/components/hub/pages/followups.jsx` — log also writes `crm_activities` (Phase 3).
- `apps/hub/components/hub/hub-command-palette.jsx` — in-place CRM actions (Phase 2).

---

## Phase 1 — 손맛 기반 + 선택 모델 (executable now)

### Task 1: Drawer ⌘Enter 저장 / Esc 닫기

**Files:**
- Modify: `apps/hub/components/hub/hub-primitives.jsx` — `Drawer` (:250), `EditDrawer` (:334)

- [ ] **Step 1: Add a shared keydown handler to `Drawer`**

In `Drawer`, add a root `onKeyDown` on the panel container: `Esc` → `onClose()`; `(metaKey||ctrlKey)+Enter` → if a `onSave` prop is present call it. `Drawer` has no `onSave` today — thread an optional `onSubmit` prop and call it on ⌘Enter. Do not swallow keys when the event target is a `textarea` for plain Enter (only act on ⌘/Ctrl+Enter and Esc).

```jsx
// inside Drawer(), on the outer panel div:
onKeyDown={(e) => {
  if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit?.(); }
}}
```
Add `onSubmit` to the `Drawer` signature (default undefined).

- [ ] **Step 2: Wire the same into `EditDrawer`**

`EditDrawer` already has `onSave`/`onClose`. Add the same `onKeyDown` to its panel, calling `onSave` on ⌘Enter and `onClose` on Esc. Guard: if `onSave` returns a promise, don't double-fire (ignore while a save is in flight using the existing saving state if present; otherwise a local `busy` ref).

- [ ] **Step 3: Verify (build + preview)**

Run: `npm run build`
Expected: build passes.
Preview: open a Lead → EditDrawer → edit a field → ⌘Enter saves & closes/persists; Esc closes without save.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/components/hub/hub-primitives.jsx
git commit -m "feat(hub/crm): ⌘Enter save + Esc close in Drawer/EditDrawer"
```

### Task 2: 칸반 컬럼별 빠른 생성 (빈 스테이지에 바로 딜)

**Files:**
- Modify: `apps/hub/components/hub/pages/revenue.jsx` — `createDeal` (:1289-1305), kanban column body (:1411-1462)

- [ ] **Step 1: Refactor `createDeal` → `createDealInStage(stageKey, title)`**

Keep the existing body but parameterize stage and optional title. Preserve the `LOCAL-…` id + workspace tag + `openDealEditor` behavior when created from the top button (no title → open drawer). When created inline with a title, DON'T open the drawer — persist immediately.

```jsx
const createDealInStage = (stageKey = DEAL_STAGES[0]?.key || 'lead', title = '') => {
  const id = `LOCAL-${Date.now().toString().slice(-4)}`;
  const deal = {
    id, name: title || '새 딜',
    type: filter === 'personal' || filter === 'company' ? filter : 'company',
    stage: stageKey, value: 0, owner: 'Me', close: '미정', age: 0,
    ...(ws ? { workspace } : {}),
  };
  setDeals(prev => [deal, ...prev]);
  if (title) { saveRevenueRecord('deal', 'create', deal).then(r => { if (r.ok && r.id) setDeals(ds => ds.map(d => d.id === id ? { ...d, id: r.id } : d)); }); }
  else openDealEditor(deal);
  return id;
};
const createDeal = () => createDealInStage();  // top button unchanged
```

- [ ] **Step 2: Add an inline "+ 딜" input at the bottom of each column**

Below the `items.map(...)` inside each column's scroll-y body, render a compact add-row: a text input (hidden until the column's add-state is active, toggled by a "+ 딜" ghost button). On `Enter` with non-empty value → `createDealInStage(s.key, value.trim())`, clear input, keep it focused for rapid entry. On `Esc` → close the input. Use `Input` (supports `onKeyDown`). Track per-column open state in a `addStage` state (string|null).

```jsx
{addStage === s.key ? (
  <Input autoFocus placeholder="딜 이름 + Enter" value={addText}
    onChange={setAddText}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && addText.trim()) { createDealInStage(s.key, addText.trim()); setAddText(''); }
      else if (e.key === 'Escape') { setAddStage(null); setAddText(''); }
    }}
    style={{ margin: 8 }} />
) : (
  <button onClick={() => { setAddStage(s.key); setAddText(''); }}
    style={{ margin: 8, padding: '6px 10px', fontSize: 11.5, color: 'var(--fg-faint)', background: 'transparent', border: '1px dashed var(--line-soft)', borderRadius: 'var(--r-sm)', textAlign: 'left', cursor: 'pointer' }}>
    + 딜
  </button>
)}
```
Add `const [addStage, setAddStage] = React.useState(null); const [addText, setAddText] = React.useState('');` to the Deals component.

- [ ] **Step 3: Verify (build + preview)**

Run: `npm run build` → passes.
Preview: on Deals, click "+ 딜" under **Proposal** → type name → Enter → a card appears **in Proposal** (not Lead). Esc closes the input. Existing top "Deal" button still opens the drawer.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/components/hub/pages/revenue.jsx
git commit -m "feat(hub/crm): kanban per-column quick-add creates deal in that stage"
```

### Task 3: 리드 인라인 빠른 추가

**Files:**
- Modify: `apps/hub/components/hub/pages/revenue.jsx` — `createLead` (:718-733), Leads list render (top of the rows list)

- [ ] **Step 1: Add `createLeadInline(name)`**

Mirror the existing `createLead` (which creates a `local-lead-…` row and opens the drawer), but when given a name: create the minimal row and **persist immediately** without opening the drawer; on success swap the local id for the real id (reuse the `persistLead` swap pattern at :737-755). Keep the existing `createLead` (top button) opening the drawer.

- [ ] **Step 2: Add an inline "+" add-row above the leads rows**

Above the leads list rows, render a single add-row with an `Input` (placeholder "리드 이름 + Enter"). On `Enter` non-empty → `createLeadInline(value)`, clear, keep focus. This does NOT open the drawer (click the created row to expand). Match the leads row grid so it aligns.

- [ ] **Step 3: Verify (build + preview)**

Run: `npm run build` → passes.
Preview: Leads → type a name in the add-row → Enter → new lead appears in the list, input stays focused for the next; clicking the row opens the drawer.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/components/hub/pages/revenue.jsx
git commit -m "feat(hub/crm): inline quick-add row for Leads"
```

### Task 4: 케이스 인라인 빠른 추가

**Files:**
- Modify: `apps/hub/components/hub/pages/revenue.jsx` — `createCase` (:1618-1631), Cases list render

- [ ] **Step 1: Add `createCaseInline(title)`** mirroring Task 3 against `createCase`/`persistCase` (:1633-1649). Immediate persist, no drawer.
- [ ] **Step 2: Add the inline "+" add-row above the cases rows** (same pattern as Task 3).
- [ ] **Step 3: Verify** — `npm run build` passes; preview: Cases add-row creates a case inline.
- [ ] **Step 4: Commit**

```bash
git add apps/hub/components/hub/pages/revenue.jsx
git commit -m "feat(hub/crm): inline quick-add row for Cases"
```

### Task 5: 선택 모델 + 키보드 훅

**Files:**
- Create: `apps/hub/components/hub/use-crm-keyboard.js`
- Modify: `apps/hub/components/hub/pages/revenue.jsx` — Deals + Leads wire the hook

- [ ] **Step 1: Write `useCrmSelection` + `useCrmKeyboard`**

`useCrmSelection(items)` returns `{ selectedId, setSelectedId, moveSelection(dir), selectedIds, toggleSelected, clearSelected }` — single-select nav now, a `Set` for Phase 4. `moveSelection('down'|'up')` walks `items` (array of `{id}`) wrapping at ends.

`useCrmKeyboard({ enabled, items, selection, onNew, onEditSelected, onSearchFocus, onStageMove, onHelp })` attaches a `keydown` listener that:
- Ignores events when `document.activeElement` is `INPUT`/`TEXTAREA`/`SELECT` or `isContentEditable`, **and** when any element with `[data-drawer-open]` is present (so drawer keys win). Exception: never blocks the browser; only our keys.
- Maps: `j`→down, `k`→up, `e`→`onEditSelected(selectedId)`, `n`→`onNew()`, `/`→`preventDefault`+`onSearchFocus()`, `1`..`5`→`onStageMove(index)`, `?`→`onHelp()`, `Escape`→`selection.clearSelected()`+`selection.setSelectedId(null)`.

```js
import React from "react";
export function useCrmSelection(items) {
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const ids = React.useMemo(() => (items || []).map(i => i.id), [items]);
  const moveSelection = React.useCallback((dir) => {
    setSelectedId(cur => {
      if (!ids.length) return null;
      const i = ids.indexOf(cur);
      if (i === -1) return ids[0];
      const next = dir === 'down' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
      return ids[next];
    });
  }, [ids]);
  const toggleSelected = React.useCallback((id) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const clearSelected = React.useCallback(() => setSelectedIds(new Set()), []);
  return { selectedId, setSelectedId, moveSelection, selectedIds, toggleSelected, clearSelected };
}
export function useCrmKeyboard({ enabled = true, selection, onNew, onEditSelected, onSearchFocus, onStageMove, onHelp }) {
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing) return;
      if (typeof document !== 'undefined' && document.querySelector('[data-drawer-open="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'j') { e.preventDefault(); selection.moveSelection('down'); }
      else if (k === 'k') { e.preventDefault(); selection.moveSelection('up'); }
      else if (k === 'e' && selection.selectedId != null) { e.preventDefault(); onEditSelected?.(selection.selectedId); }
      else if (k === 'n') { e.preventDefault(); onNew?.(); }
      else if (k === '/') { e.preventDefault(); onSearchFocus?.(); }
      else if (k === '?') { e.preventDefault(); onHelp?.(); }
      else if (/^[1-5]$/.test(k) && onStageMove) { e.preventDefault(); onStageMove(Number(k) - 1); }
      else if (k === 'Escape') { selection.setSelectedId(null); selection.clearSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, selection, onNew, onEditSelected, onSearchFocus, onStageMove, onHelp]);
}
```

- [ ] **Step 2: Mark drawers with `data-drawer-open`**

In `hub-primitives.jsx`, add `data-drawer-open="true"` to the `Drawer`/`EditDrawer` root panel so the hook yields to open drawers.

- [ ] **Step 3: Wire into Deals**

In Deals: `const selection = useCrmSelection(scopedDeals); useCrmKeyboard({ selection, onNew: createDeal, onEditSelected: (id) => { const d = deals.find(x => x.id === id); if (d) openDealEditor(d); }, onSearchFocus: () => searchRef.current?.focus(), onStageMove: (i) => { if (selection.selectedId && DEAL_STAGES[i]) move(selection.selectedId, DEAL_STAGES[i].key); }, onHelp: () => setShortcutsOpen(true) });` Add a ref to the search `Input`. Render selected card with a `outline: 1px solid var(--moon-300)` ring when `d.id === selection.selectedId`.

- [ ] **Step 4: Wire into Leads** — same, `onNew: createLead`, `onEditSelected: setEditLeadId`, no `onStageMove`. Ring on the selected row.

- [ ] **Step 5: Verify (build + preview)**

Run: `npm run build` → passes.
Preview: on Deals, `j`/`k` move a focus ring across cards, `e` opens the selected deal, `1`-`5` move it across stages, `/` focuses search, `n` creates. Typing in an input does NOT trigger shortcuts. Drawer open → shortcuts inert.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/components/hub/use-crm-keyboard.js apps/hub/components/hub/pages/revenue.jsx apps/hub/components/hub/hub-primitives.jsx
git commit -m "feat(hub/crm): selection model + keyboard shortcuts (j/k/e/n///1-5)"
```

### Task 6: 단축키 오버레이 (`?`)

**Files:**
- Create: `apps/hub/components/hub/crm-shortcut-overlay.jsx`
- Modify: `apps/hub/components/hub/pages/revenue.jsx` — render `<ShortcutOverlay open={shortcutsOpen} onClose={…}/>` in Deals + Leads

- [ ] **Step 1: Write `ShortcutOverlay`** — a small centered modal (mirror CommandPalette's overlay markup) listing rows of `<Kbd>` + description: `J/K 이동 · E 편집 · N 새로 · / 검색 · 1–5 스테이지 · X 선택 · Esc 해제`. Close on backdrop click / Esc. Tokens only (`--surface-2`, `--line`, `Kbd`).
- [ ] **Step 2: Add `const [shortcutsOpen, setShortcutsOpen] = React.useState(false)`** to Deals + Leads and render the overlay.
- [ ] **Step 3: Verify** — build passes; preview: `?` opens the overlay, Esc/click closes.
- [ ] **Step 4: Commit**

```bash
git add apps/hub/components/hub/crm-shortcut-overlay.jsx apps/hub/components/hub/pages/revenue.jsx
git commit -m "feat(hub/crm): ? shortcut help overlay"
```

### Phase 1 gate
- [ ] `npm run lint` (or `npx eslint` over touched dirs) → 0 warnings on touched files.
- [ ] `npm run build` → passes.
- [ ] Preview regression: existing drag-drop, 명함 intake, 딜 전환, Guru 진단 all still work.

---

## Phase 2 — 컨텍스트 메뉴 + ⌘K CRM 액션 (roadmap → full plan on Phase 1 land)

Depends on Phase 1's `useCrmSelection` + `openDealEditor`/`setEditLeadId`/`convertLeadToDeal`/`queueFollowup` handlers.

- **Task 2.1 — `crm-context-menu.jsx`:** generalize `ContactMenu` (revenue.jsx:1830) into `ContextMenu({ x, y, items, onClose })` anchored at cursor. Outside-click + Esc close (reuse ContactMenu's effect).
- **Task 2.2 — Deal card `onContextMenu`:** open ContextMenu with 편집 / 스테이지 이동(submenu 1-5) / 팔로업 큐 / Guru 진단 / 삭제 → call existing handlers. `e.preventDefault()`.
- **Task 2.3 — Lead row `onContextMenu`:** 편집 / 딜 전환(`convertLeadToDeal`) / 팔로업 큐 / 삭제.
- **Task 2.4 — ⌘K in-place actions:** in `hub-command-palette.jsx`, add actions that deep-link (reuse `?new=`/`?lead=` — no new registry): "새 리드" → `dashboard/revenue/leads?new=lead`, "새 딜" → `dashboard/revenue/deals?new=deal`, "리드로 점프…" → filter leads by name → `?lead=<id>`. Add `?new=lead|deal` consumers in Leads/Deals mirroring the existing `?new=project` consumer (projects.jsx:374).
- **Verify:** build + preview (right-click a card → menu acts; ⌘K "새 딜" lands on Deals with a fresh card).

## Phase 3 — 활동·팔로업 카드 배선 (roadmap; **test-first for write layer**)

- **Task 3.1 (TDD) — `revenue-write.js` next_action + snooze:** write `apps/hub/lib/sales-os/revenue-write.test.mjs` asserting `buildLeadWrite({ next_action:'전화', snooze_until:'2026-07-10' })` → `columns.next_action==='전화'` + `metaPatch.snooze_until==='2026-07-10'`; `buildDealWrite({ next_action, snooze_until })` → both in `metaPatch`. Run `node --test` (fail) → implement whitelist additions → pass.
- **Task 3.2 (TDD) — `followups-ledger.js` snooze respect:** unit the overdue predicate: a lead/deal with `meta.snooze_until` in the future is excluded from `items`. Extract the snooze check into a tiny pure helper `isSnoozed(meta, now)` and `.test.mjs` it.
- **Task 3.3 — card/drawer one-click channel log:** add `전화·DM·방문·카톡` buttons to Lead/Deal EditDrawer (reuse `LogComposer`/`saveActivity`). On click: `saveActivity('create', { kind, body, leadId|dealId })` **and** POST `/api/integrations/outcomes/record` (mirror followups.jsx) **and** persist `next_action` + optional `snooze_until` via `saveRevenueRecord`. Build + preview.
- **Task 3.4 — followups.jsx dual-write:** its quick-log also records `crm_activities` (so the timeline shows it).
- **Task 3.5 — "오늘 팔로업" strip:** fetch `/api/hub/followups`, render a compact overdue/dueToday strip on RevenueOverview + top of Deals with channel one-click + snooze. Reuse followups.jsx row markup.
- **Verify:** `node --test` green; preview: log 전화 from a deal card → activity appears in its DrawerTimeline; snooze hides it from the follow-up strip until the date.

## Phase 4 — 일괄 작업 + 저장된 뷰 (roadmap)

Depends on Phase 1's `useCrmSelection` (`selectedIds`/`toggleSelected`).

- **Task 4.1 — multi-select:** Checkbox (hover-revealed) on lead rows + deal cards, Shift-click range, `x` key toggles `selectedId`. Ring/curtain on selected.
- **Task 4.2 — `crm-bulk-bar.jsx` `BulkBar`:** bottom-fixed bar when `selectedIds.size>0`: 스테이지 변경(딜) · 태그 추가 · 팔로업 큐 · 삭제. Each loops `saveRevenueRecord`/`queueFollowup` over the set (optimistic) + result toast. **Owner bulk deferred** (open question §7).
- **Task 4.3 — `SavedViews`:** persist `{workspace,stage,search,sort}` combos to `localStorage['mlp.revenue.views']`; chip row to apply/delete. Mirror the density/theme persistence in hub-app.jsx.
- **Verify:** build + preview (select 3 leads → bulk tag → all update; save a view → reload → chip restores filters).

---

## Self-Review (against spec)

- **Spec §3 Phase 1** → Tasks 1-6 cover drawer keys, kanban quick-add, inline add (lead/case), selection+shortcuts, overlay. ✓
- **Spec §3 Phase 2/3/4** → roadmap tasks 2.x/3.x/4.x map 1:1 to spec bullets; full task detail written when each phase starts (dependencies on realized P1 interfaces). ✓
- **Spec §4 decisions** — snooze=`meta.snooze_until` (Task 3.1/3.2), next_action mapping (Task 3.1), dual-logging (Task 3.3/3.4), saved views localStorage (Task 4.3), owner bulk deferred (Task 4.2). ✓
- **No-migration** — all new persistence on existing columns/meta/localStorage. ✓
- **Placeholder scan** — Phase 1 tasks contain real code + exact anchors; Phase 2-4 are explicitly a roadmap (not fake-detailed), expanded on landing. ✓
- **Type consistency** — `useCrmSelection`/`useCrmKeyboard` signatures defined in Task 5 are the ones referenced in Phase 2/4 roadmap. `createDealInStage` defined in Task 2 reused in Phase 2 ⌘K. ✓

*Phases are independently shippable; execute Phase 1 fully, ship, then expand Phase 2's plan against realized interfaces.*
