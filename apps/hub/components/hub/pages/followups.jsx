"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Button, Card, Checkbox, Divider, Drawer, Dot, EmptyState, SegmentedControl, SyncBadge } from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { QUICK_LOG_ACTIONS as LOG_ACTIONS, REACTION_OPTIONS } from "@/lib/sales-os/outcome-attribution";
import { DEAL_STAGES, STAGE_ALIASES } from "@/lib/deal-stages";

// crm_activities.reaction vocabulary (Phase 1C canonical, deep-design spec §10) — distinct from
// this page's own REACTION_OPTIONS (outreach_outcomes.meta.reaction), which predates and doesn't
// match it. The activity panel below reads crm_activities, so it labels with THIS vocabulary.
const CRM_REACTION_LABEL = { positive: "긍정", neutral: "중립", concern: "우려", rejected: "거절", no_response: "무응답" };

// Small, duplicated on purpose (not imported from ./revenue): that page is its own lazy-loaded
// route chunk, and a static cross-import here pulled its entire ~1400-line module (Leads/Deals/
// Accounts/DetailPanel/…) into this chunk too, which broke Turbopack's dev chunk graph outright
// (page hung on the loading fallback, no console error). Three small object literals are cheaper
// than that.
const ACT_ICON = { email: "email", meeting: "calendar", call: "signal", note: "edit", deal: "deals", kakao: "chat", quote: "orders", ai: "sparkle", info_session: "brief", demo: "play", visit: "building", update: "rhythm" };
const ACT_TONE = Object.fromEntries(Object.keys(ACT_ICON).map((key) => [key, "neutral"]));
const ACT_LABEL = { email: "Email", meeting: "Meeting", call: "Call", note: "Note", deal: "Deal", kakao: "카카오", quote: "견적", ai: "AI", info_session: "설명회", demo: "데모", visit: "방문", update: "Update" };

const STAGE_BY_KEY = Object.fromEntries(DEAL_STAGES.map((s) => [s.key, s]));
function stageMeta(rawStage) {
  if (!rawStage) return null;
  const key = STAGE_ALIASES[rawStage] || rawStage;
  return STAGE_BY_KEY[key] || null;
}

const CHANNEL_ICON = { "전화/문자": "chat", "방문": "building", "카톡": "chat", "일정": "calendar" };

// record_contact_outcome_v1 어휘로의 매핑 — 이 페이지의 운영자 어휘(관심/고민중/보류/거절,
// 채널 라벨)는 유지하고 전송 시에만 RPC canonical로 변환한다.
const RPC_KIND_BY_CHANNEL = { "카톡": "kakao", "방문": "visit", "전화/문자": "call" };
const RPC_REACTION = { interested: "positive", considering: "neutral", hold: "concern", declined: "rejected" };

const LANE_OPTIONS = [
  { key: "all", label: "전체" },
  { key: "lead", label: "리드" },
  { key: "deal", label: "딜" },
  { key: "event", label: "일정" },
];
const BUCKET_OPTIONS = [
  { key: "all", label: "전체" },
  { key: "overdue", label: "지남" },
  { key: "today", label: "오늘" },
  { key: "week", label: "이번 주" },
];
const LANE_LABEL = { lead: "리드", deal: "딜", event: "일정" };
const LANE_TONE = { lead: "neutral", deal: "neutral", event: "neutral" };
const BUCKET_STRIPE = { overdue: "var(--danger)" };

// 모듈 스코프 SWR(7차 속도): 코어 데일리 표면인데 탭 복귀마다 스켈레톤 + 원장 재조회를
// 반복하던 유일한 예외였다 — 5분 내 캐시를 즉시 서빙하고 항상 배경 재검증한다
// (revenue/daily-brief/attention/projects와 같은 serve-then-revalidate 계약).
// 재검증 실패는 기존대로 error 명명 — 오래된 데이터를 live로 위장하지 않는다.
const FOLLOWUPS_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let followupsCache = null; // { at, state: { syncState, items, summary } }

function useFollowups() {
  const cached = followupsCache && Date.now() - followupsCache.at < FOLLOWUPS_CACHE_SERVABLE_MS
    ? followupsCache.state
    : null;
  const [state, setState] = React.useState(cached || { syncState: "loading", items: [], summary: {} });
  // 새로고침·기록 후 reload가 겹치면 늦게 온 이전 응답이 최신 목록을 덮을 수 있다 —
  // 요청 id로 최신 요청만 반영한다(re-audit S13).
  const requestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const isCurrent = () => requestRef.current === requestId;
    // 캐시 서빙 중에는 로딩 스켈레톤으로 갈아치우지 않는다 — 조용한 재검증.
    const servable = followupsCache && Date.now() - followupsCache.at < FOLLOWUPS_CACHE_SERVABLE_MS;
    if (!servable) setState((s) => ({ ...s, syncState: "loading" }));
    try {
      const r = await fetch("/api/hub/followups", { cache: "no-store" });
      if (!isCurrent()) return;
      const d = await r.json().catch(() => null);
      if (!isCurrent()) return;
      if (!r.ok || !d || d.status === "error") {
        setState((s) => ({ ...s, syncState: "error" }));
        return;
      }
      const next = {
        // partial = 일부 소스 read 실패 — live로 뭉개지 않고 배지로 표시한다(§5.3).
        syncState: d.status === "live" ? "live" : d.status === "partial" ? "partial" : "preview",
        items: Array.isArray(d.items) ? d.items : [],
        summary: d.summary || {},
      };
      followupsCache = { at: Date.now(), state: next };
      setState(next);
    } catch {
      if (isCurrent()) setState((s) => ({ ...s, syncState: "error" }));
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Inline min-record capture (operator-workflow-profile.md §7 확정): 대화 요약 + 고객 반응 +
// 다음 행동과 날짜(또는 기약 없음). Replaces the old fire-immediately quick-log tap — a single
// tap used to write nothing but the action tag, which fell short of the confirmed requirement.
function LogForm({ item, action, label, onCancel, onSubmit, submitting, error, initial }) {
  // initial: 저장 실패로 폼을 되살릴 때 입력을 복원한다(무언 소실 금지).
  const [summary, setSummary] = React.useState(initial?.summary ?? "");
  const [reaction, setReaction] = React.useState(initial?.reaction ?? null);
  const [nextAction, setNextAction] = React.useState(initial?.nextAction ?? "");
  const [at, setAt] = React.useState(initial?.at ?? "");
  const [dormant, setDormant] = React.useState(Boolean(initial?.dormant));

  // 확정 최소 기록(프로필 §7): 요약 + 반응 + 다음 행동 날짜(또는 기약 없음). RPC도 요약·반응이
  // 비면 invalid-input으로 거부하므로 여기서 먼저 막는다. 노응답 기록은 반응이 자동(no_response).
  const canSubmit =
    Boolean(summary.trim()) &&
    Boolean(reaction || action === "no_response") &&
    Boolean(dormant || at) &&
    !submitting;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)" }}>
      <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{item.name} · <Badge tone={LANE_TONE[item.kind]} size="xs" variant="outline">{label}</Badge> 기록</div>

      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="대화 요약 한 줄"
        style={{ height: 32, padding: "0 10px", fontSize: 12.5, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", outline: "none" }}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {REACTION_OPTIONS.map((r) => (
          <Button key={r.key} type="button" variant={reaction === r.key ? "secondary" : "outline"} size="xs" onClick={() => setReaction(r.key)}>
            {r.label}
          </Button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="다음 행동"
          style={{ flex: 1, minWidth: 120, height: 32, padding: "0 10px", fontSize: 12.5, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", outline: "none" }}
        />
        <input
          type="date"
          value={at}
          disabled={dormant}
          onChange={(e) => setAt(e.target.value)}
          style={{ height: 32, padding: "0 8px", fontSize: 12.5, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", outline: "none", opacity: dormant ? 0.5 : 1 }}
        />
        <Checkbox checked={dormant} onChange={(v) => { setDormant(v); if (v) setAt(""); }} label="기약 없음" />
        <span style={{ fontSize: 11.5, color: "var(--fg-faint)" }}>기약 없음</span>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
        {error && (
          <span role="alert" style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--danger)" }}>{error}</span>
        )}
        <Button variant="ghost" size="xs" onClick={onCancel} disabled={submitting}>취소</Button>
        <Button
          variant="primary"
          size="xs"
          disabled={!canSubmit}
          onClick={() => onSubmit({ summary, reaction, nextAction, at, dormant })}
        >
          {submitting ? "기록 중…" : "기록"}
        </Button>
      </div>
    </div>
  );
}

// Read-only recent-activity panel — clicking a row used to navigate away to the full Leads/
// Deals drawer just to see what happened last; this shows crm_activities in place instead
// (the same activity ledger Accounts/Customer 360 already read).
//
// Joins on companyId when the row has one, falling back to the lead/deal id only when it
// doesn't: live crm_activities carries company_id on 109 of 110 rows, but lead_id on 1 and
// deal_id on 0 — history has always been written against the company/account. Joining on the
// row's own id would render "기록 없음" for effectively every row.
function ActivityPanel({ item, onClose, onNavigate }) {
  const [state, setState] = React.useState({ syncState: "loading", activities: [] });

  React.useEffect(() => {
    if (!item) return;
    let active = true;
    setState({ syncState: "loading", activities: [] });
    const qs = item.companyId
      ? `companyId=${encodeURIComponent(item.companyId)}`
      : item.kind === "deal"
        ? `dealId=${encodeURIComponent(item.id)}`
        : `leadId=${encodeURIComponent(item.id)}`;
    fetch(`/api/hub/revenue/activity?${qs}`, { cache: "no-store" })
      .then((r) => {
        // 5xx JSON 응답을 preview로 오독하면 "활동 기록이 없습니다"로 보인다 — 읽기 실패는 error.
        if (!r.ok) throw new Error(`activity ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!active) return;
        setState({
          syncState: d.status === "live" ? "live" : "preview",
          activities: Array.isArray(d.activities) ? d.activities : [],
        });
      })
      .catch(() => { if (active) setState({ syncState: "error", activities: [] }); });
    return () => { active = false; };
  }, [item?.kind, item?.id, item?.companyId]);

  if (!item) return null;
  const stage = stageMeta(item.stage);

  return (
    <Drawer
      title={item.name}
      subtitle={item.company && item.company !== item.name ? item.company : stage?.label || null}
      onClose={onClose}
      footer={item.href ? <Button variant="outline" size="sm" onClick={() => onNavigate?.(item.href)}>정식 편집 열기</Button> : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        최근 기록<SyncBadge state={state.syncState} />
      </div>
      {state.syncState === "loading" ? (
        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>불러오는 중…</div>
      ) : state.syncState === "error" ? (
        <EmptyState icon="clock" title="활동 기록을 읽지 못했습니다" description="원장 연결 상태를 확인한 뒤 다시 열어 주세요." style={{ minHeight: 140 }} />
      ) : state.activities.length === 0 ? (
        <EmptyState icon="clock" title="활동 기록이 없습니다" description="연락 기록이 쌓이면 여기에 표시됩니다." style={{ minHeight: 140 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {state.activities.map((a, i) => (
            <React.Fragment key={a.id}>
              <div style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, padding: "10px 0", alignItems: "flex-start" }}>
                <span style={{ color: "var(--fg-muted)", marginTop: 1 }}>
                  <Iconed name={ACT_ICON[a.type] || "edit"} size={13} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.msg}</div>
                  <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge tone={ACT_TONE[a.type] || "neutral"} size="xs" variant="outline">{ACT_LABEL[a.type] || a.type}</Badge>
                    {a.reaction && <Badge tone="neutral" size="xs" variant="outline">{CRM_REACTION_LABEL[a.reaction] || a.reaction}</Badge>}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>{a.at}</span>
              </div>
              {i < state.activities.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function FollowupRow({ item, onNavigate, onOpenPanel, logDraft, onOpenLog, onCloseLog, onSubmitLog, logError, logged, kbSelected }) {
  const stage = stageMeta(item.stage);
  const clickable = Boolean(item.href);
  const isLogging = logDraft?.itemId === item.id;

  return (
    <div
      className="hub-row"
      data-kb-row={`${item.kind}-${item.id}`}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--line-soft)",
        boxShadow: BUCKET_STRIPE[item.bucket] ? `inset 1px 0 0 ${BUCKET_STRIPE[item.bucket]}` : undefined,
        ...(kbSelected ? { outline: '1px solid var(--moon-300)', outlineOffset: -1 } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Iconed name={CHANNEL_ICON[item.channel] || "chat"} size={14} style={{ color: "var(--moon-300)" }} />
        <span
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onOpenPanel?.(item) : undefined}
          onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenPanel?.(item); } } : undefined}
          style={{ fontSize: 13.5, fontWeight: 500, cursor: clickable ? "pointer" : "default" }}
        >
          {item.name}
        </span>
        {item.company && item.company !== item.name && (
          <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>· {item.company}</span>
        )}
        {item.kind !== "event" && <Badge tone={LANE_TONE[item.kind]} size="xs" variant="outline">{LANE_LABEL[item.kind]}</Badge>}
        {stage && <Badge tone="neutral" size="xs" variant="outline">{stage.label}</Badge>}
        <Badge tone="neutral" size="xs" variant="outline">{item.channel}</Badge>
        <div style={{ flex: 1 }} />
        {item.phone && <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{item.phone}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--fg-muted)" }}>{item.why}</span>
        {item.nextAction && <span style={{ color: "var(--fg-faint)" }}>→ {item.nextAction}</span>}
        {item.kind === "event" && item.whenLabel && <span className="mono" style={{ color: "var(--fg-faint)" }}>{item.whenLabel}</span>}
      </div>
      {item.lastNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--fg-faint)" }}>
          <Iconed name="chat" size={11} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>최근 대화: {item.lastNote}</span>
          {item.lastReaction && <Badge tone="neutral" size="xs" variant="outline">{REACTION_OPTIONS.find((r) => r.key === item.lastReaction)?.label || item.lastReaction}</Badge>}
        </div>
      )}

      {item.kind !== "event" && (
        isLogging ? (
          <LogForm
            key={logDraft.initial ? "restored" : "fresh"}
            item={item}
            action={logDraft.action}
            label={logDraft.label}
            initial={logDraft.initial}
            error={logError}
            onCancel={onCloseLog}
            onSubmit={(fields) => onSubmitLog(item, logDraft.action, logDraft.label, fields)}
          />
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {logged ? (
              <span style={{ fontSize: 12, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                <Dot tone="neutral" /> 기록됨: {logged}
              </span>
            ) : (
              LOG_ACTIONS.map((a) => (
                <Button key={a.action} variant="outline" size="xs" onClick={() => onOpenLog(item, a.action, a.label)}>
                  {a.label}
                </Button>
              ))
            )}
          </div>
        )
      )}
    </div>
  );
}

export function Followups({ onNavigate }) {
  const { syncState, items, summary, reload } = useFollowups();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [lane, setLane] = React.useState("all");
  const [bucket, setBucket] = React.useState("all");
  const [logDraft, setLogDraft] = React.useState(null); // { itemId, action, label, initial? }
  const [logError, setLogError] = React.useState(null);
  const [logged, setLogged] = React.useState({}); // id → action label
  const [notice, setNotice] = React.useState(null); // { tone, label, action? } — 되돌리기 창 표시
  const [panelItem, setPanelItem] = React.useState(null); // row whose activity panel is open
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  const laneCounts = React.useMemo(() => {
    const counts = { all: items.length, lead: 0, deal: 0, event: 0 };
    items.forEach((i) => { counts[i.kind] = (counts[i.kind] || 0) + 1; });
    return counts;
  }, [items]);

  const bucketCounts = React.useMemo(() => {
    const counts = { all: items.length, overdue: 0, today: 0, week: 0 };
    items.forEach((i) => { counts[i.bucket] = (counts[i.bucket] || 0) + 1; });
    return counts;
  }, [items]);

  const visible = React.useMemo(() => {
    return items.filter((i) => (lane === "all" || i.kind === lane) && (bucket === "all" || i.bucket === bucket));
  }, [items, lane, bucket]);

  // Deep-link: ?focus=<id> opens that row's activity panel once the ledger has loaded, then
  // strips the query so a refresh doesn't replay it (DESIGN.md §8.1 deep-link contract, same
  // one-shot shape as revenue.jsx's ?lead=/?deal=). This is the middle hop of 할 일 → 연락 →
  // 리드 상세: My Work links here with ?focus=, the panel's 정식 편집 열기 goes on to the lead.
  const focusParam = searchParams?.get("focus") || null;
  const consumedFocusRef = React.useRef(null);
  React.useEffect(() => {
    if (!focusParam || syncState === "loading") return;
    if (consumedFocusRef.current === focusParam) return;
    const hit = items.find((i) => String(i.id) === String(focusParam));
    if (!hit) return;
    consumedFocusRef.current = focusParam;
    setPanelItem(hit);
    if (pathname) router.replace(pathname);
  }, [focusParam, syncState, items, pathname, router]);

  // 키보드 계층(§8.1) — 코어 데일리 루프에 j/k/e 배선: j/k 행 이동, e 상세 패널.
  const kbRows = React.useMemo(() => visible.map((i) => ({ id: `${i.kind}-${i.id}` })), [visible]);
  const kbSelection = useCrmSelection(kbRows);
  useCrmKeyboard({
    selection: kbSelection,
    onEditSelected: (rowId) => {
      const item = visible.find((i) => `${i.kind}-${i.id}` === rowId);
      if (item) setPanelItem(item);
    },
  });
  React.useEffect(() => {
    if (!kbSelection.selectedId) return;
    document.querySelector(`[data-kb-row="${CSS.escape(kbSelection.selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [kbSelection.selectedId]);

  const openLog = (item, action, label) => { setLogError(null); setLogDraft({ itemId: item.id, action, label }); };
  const closeLog = () => { setLogError(null); setLogDraft(null); };

  // Phase 1C 원자 RPC 경로 — 활동 기록 + 대상 원장 next_action 갱신이 한 트랜잭션이다.
  // (기존 /api/integrations/outcomes/record는 outreach insert와 lead 갱신이 비원자 2단계라
  // 반쪽 저장 시 next_action 날짜가 옛값으로 남아 리드가 오늘/지남 버킷에서 소리 없이 빠졌고,
  // outreach_outcomes는 이 페이지의 활동 패널이 읽는 crm_activities에도 나타나지 않았다.)
  const persistLog = async (item, action, label, { summary, reaction, nextAction, at, dormant }) => {
    try {
      const res = await fetch("/api/hub/revenue/contact-outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: item.kind, // 'lead' | 'deal'
          entityId: item.id,
          kind: action === "meeting" ? "meeting" : RPC_KIND_BY_CHANNEL[item.channel] || "call",
          summary,
          reaction: action === "no_response" ? "no_response" : RPC_REACTION[reaction] || "",
          nextAction: nextAction || null,
          nextActionAt: dormant ? null : at || null,
          dormant: Boolean(dormant),
        }),
      });
      const data = await res.json().catch(() => null);
      // 4xx/5xx도 fetch는 resolve한다 — status='saved' 확인 없이는 실패가 "기록됨"으로 표시된다.
      if (!res.ok || data?.status !== "saved") {
        const reason = data?.status === "preview" ? "preview" : data?.error || res.status;
        throw new Error(`contact-outcome ${reason}`);
      }
      await reload();
    } catch (err) {
      // 늦은 실패: 기록됨 표시를 걷어내고 폼을 입력 그대로 되살린다(무언 소실 금지).
      setLogged((m) => { const n = { ...m }; delete n[item.id]; return n; });
      setLogDraft({ itemId: item.id, action, label, initial: { summary, reaction, nextAction, at, dormant } });
      setLogError(
        String(err?.message || "").includes("preview")
          ? "Supabase 미연결 — 기록이 저장되지 않았습니다. 연결 후 다시 시도하세요."
          : "기록 저장에 실패했습니다. 다시 시도하세요.",
      );
      setNotice({ tone: "err", label: "기록 저장 실패 — 입력을 복원했습니다." });
    }
  };

  // 기록도 되돌리기 창을 갖는다(최고 빈도 액션 — my-work 완료와 같은 deferred-write 계약):
  // 즉시 "기록됨"으로 표시하되 실제 POST는 3.5초 뒤. 되돌리기는 진짜 취소(네트워크 없음).
  const submitLog = (item, action, label, fields) => {
    const key = `log-${item.id}`;
    setLogError(null);
    setLogged((m) => ({ ...m, [item.id]: label }));
    setLogDraft(null);
    setNotice({ key, tone: "ok", label: `기록됨 · ${item.name}`, action: { label: "되돌리기", onClick: () => undoLog(item) } });
    scheduleUndoable(key, () => {
      // 창이 닫히면 알림을 통째로 걷는다 — 라벨만 남기면 "기록됨"이 다음 액션까지
      // 영구 표시된다(7차 UIUX — revenue·daily-brief의 전체 소거 패턴으로 통일).
      setNotice((cur) => (cur?.key === key ? null : cur));
      persistLog(item, action, label, fields);
    });
  };

  const undoLog = (item) => {
    const key = `log-${item.id}`;
    if (!cancelUndoable(key)) {
      setNotice((cur) => (cur?.key === key ? null : cur));
      return; // 창이 닫혔으면 이미 POST됐다
    }
    setLogged((m) => { const n = { ...m }; delete n[item.id]; return n; });
    setNotice({ tone: "ok", label: "기록 취소됨" });
  };

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1100 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>고객 연락</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            오늘 연락할 사람 · 채널 · 왜 · 다음 행동
            {["live", "partial"].includes(syncState) && (summary.overdue ?? 0) > 0 && (
              <span className="num" style={{ marginLeft: 8, color: "var(--danger)" }}>{summary.overdue} overdue</span>
            )}
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {notice && (
          // live region(§11) — 되돌리기 창 개방을 스크린리더에도 알린다. 완료 카피는 중립(§5.3).
          <span
            role={notice.tone === "err" ? "alert" : "status"}
            aria-live="polite"
            style={{ fontSize: 11.5, color: notice.tone === "err" ? "var(--danger)" : "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 8, marginRight: 8 }}
          >
            {notice.label}
            {notice.action && (
              <Button variant="ghost" size="xs" onClick={notice.action.onClick}>{notice.action.label}</Button>
            )}
          </span>
        )}
        <Button variant="ghost" size="sm" icon="runs" onClick={reload}>새로고침</Button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <SegmentedControl
          label="레인"
          options={LANE_OPTIONS.map((o) => ({ ...o, label: `${o.label} ${laneCounts[o.key] || 0}` }))}
          value={lane}
          onChange={setLane}
        />
        <SegmentedControl
          label="버킷"
          options={BUCKET_OPTIONS.map((o) => ({ ...o, label: `${o.label} ${bucketCounts[o.key] || 0}` }))}
          value={bucket}
          onChange={setBucket}
        />
      </div>

      <Card pad={false} className="hub-table-card">
        {visible.length === 0 ? (
          // error를 preview 문구("연결되면 표시됩니다")로 뭉개면 읽기 실패가 "오늘 할 일 없음"으로
          // 보인다 — 후속 누락 0건 목표에서 가장 위험한 오독이라 상태별로 분리한다(§5.3 source truth).
          syncState === "error" ? (
            <EmptyState
              icon="clock"
              title="팔로업 원장을 읽지 못했습니다"
              description="지금 화면은 비어 보이지만 실제 후속 항목이 있을 수 있습니다. 다시 시도해 주세요."
              action={<Button variant="outline" size="sm" onClick={reload}>다시 시도</Button>}
            />
          ) : (
            <EmptyState
              icon="rhythm"
              title={["live", "partial"].includes(syncState) ? "표시할 항목이 없습니다" : "팔로업 데이터 없음"}
              description={
                syncState !== "live"
                  ? "리드·딜이 쌓이고 Supabase가 연결되면 표시됩니다."
                  : lane === "all" && bucket === "all"
                    ? "정체된 리드·딜이 생기면 여기에 우선순위로 뜹니다."
                    : "이 필터에 해당하는 항목이 없습니다."
              }
              action={lane !== "all" || bucket !== "all"
                ? <Button variant="outline" size="sm" onClick={() => { setLane("all"); setBucket("all"); }}>전체 보기</Button>
                : <Button variant="outline" size="sm" icon="leads" onClick={() => onNavigate?.("dashboard/revenue/leads")}>리드 목록 열기</Button>}
            />
          )
        ) : (
          visible.map((item) => (
            <FollowupRow
              key={`${item.kind}-${item.id}`}
              kbSelected={kbSelection.selectedId === `${item.kind}-${item.id}`}
              item={item}
              onNavigate={onNavigate}
              onOpenPanel={setPanelItem}
              logDraft={logDraft}
              onOpenLog={openLog}
              onCloseLog={closeLog}
              onSubmitLog={submitLog}
              logError={logError}
              logged={logged[item.id]}
            />
          ))
        )}
      </Card>
      <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>
        기록한 결과는 crm_activities에 쌓여 내일 우선순위·전환 퍼널에 반영됩니다.
      </div>

      {panelItem && <ActivityPanel item={panelItem} onClose={() => setPanelItem(null)} onNavigate={onNavigate} />}
    </div>
  );
}
