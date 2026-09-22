"use client";

import React from "react";
import { OfficeWorkflowPanel } from '../office-workflow-panel';
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Button, Card, Divider, Drawer, Dot, EmptyState, SegmentedControl, Skeleton, SyncBadge, useToast } from "../hub-primitives";
import { UNDO_WINDOW_MS } from "../use-undoable-action";
import { ContactRecordDrawer } from "../contact-record-form";
import { CrmNudgeSection, useCrmNudges } from "../crm-nudge";
import { channelLabel } from "@/lib/sales-os/contact-record";
import { REACTION_LABEL as CRM_REACTION_LABEL } from "@/lib/sales-os/followup-scoring";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { requestPersonaChat } from "../persona-client";
import { DEAL_STAGES, STAGE_ALIASES } from "@/lib/deal-stages";
import { FOLLOWUP_GROUPS, MAX_DANGER_RAILS, groupFollowups } from "@/lib/sales-os/followup-groups";

// crm_activities.reaction 어휘(Phase 1C canonical, 심화 설계 §10)의 라벨은 followup-scoring이
// 정본이다(순수 모듈이라 청크 문제 없음). 이 페이지가 쓰던 옛 입력 어휘(outcome-attribution의
// REACTION_OPTIONS)는 기록창이 공용 폼으로 옮겨가며 사라졌다.

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
// 행이 제안하는 채널 라벨 → 기록창의 채널 키.
const CHANNEL_PRESET = { "카톡": "kakao", "방문": "visit", "전화/문자": "call", "문자/전화": "call", "스레드 DM": "kakao" };

const LANE_OPTIONS = [
  { key: "all", label: "전체" },
  { key: "lead", label: "리드" },
  { key: "deal", label: "딜" },
  { key: "event", label: "일정" },
];
const LANE_LABEL = { lead: "리드", deal: "딜", event: "일정" };
const LANE_TONE = { lead: "neutral", deal: "neutral", event: "neutral" };

// 모듈 스코프 SWR(7차 속도): 코어 데일리 표면인데 탭 복귀마다 스켈레톤 + 기록 재조회를
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
        if (d?.status === "error") {
          setState({ syncState: "error", activities: [] });
          return;
        }
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
        // 레이아웃이 정해진 타임라인의 로딩은 스켈레톤(DESIGN §11) — preview/error에는 쓰지 않는다.
        <Skeleton lines={3} label="최근 기록 불러오는 중" />
      ) : state.syncState === "error" ? (
        <EmptyState icon="clock" title="활동 기록을 읽지 못했습니다" description="기록 연결 상태를 확인한 뒤 다시 열어 주세요." style={{ minHeight: 140 }} />
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
      {['lead','deal'].includes(item.kind) && <OfficeWorkflowPanel key={`${item.kind}:${item.id}`} intent="customer_reply"
        scope={item.workspace === 'classin' || item.type === 'company' ? 'classin' : item.workspace === 'brand' || item.type === 'personal' ? 'personal' : null}
        originRef={{entityType:item.kind,entityId:item.id}} title="답장 초안" onNavigate={onNavigate} />}
    </Drawer>
  );
}

function FollowupDraftDrawer({ item, onClose, onRecord }) {
  const toast = useToast();
  const [lens, setLens] = React.useState("voss");
  const [loading, setLoading] = React.useState(false);
  const [draftResult, setDraftResult] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [errorNote, setErrorNote] = React.useState("");
  const requestController = React.useRef(null);

  const generateDraft = React.useCallback(async (targetLens) => {
    if (!item || requestController.current) return;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setCopied(false);
    setDraftResult(null);
    setErrorNote("");
    try {
      const res = await requestPersonaChat({
        personaId: "sales",
        mode: "outreach-draft",
        lens: targetLens || lens,
        context: {
          clientName: item.name,
          company: item.company,
          stage: item.stage,
          why: item.why,
          lastNote: item.lastNote,
          lastReaction: item.lastReaction,
          nextAction: item.nextAction,
          channel: item.channel,
        },
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.state === "done") {
        setDraftResult(res.text);
      } else {
        setErrorNote(res.note || "초안을 생성하지 못했습니다.");
      }
    } catch {
      if (!controller.signal.aborted) setErrorNote("초안 생성 중 오류가 발생했습니다.");
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(false);
      }
    }
  }, [item, lens]);

  React.useEffect(() => {
    generateDraft(lens);
    return () => {
      requestController.current?.abort();
      requestController.current = null;
    };
  }, [generateDraft, lens]);

  if (!item) return null;

  const handleCopy = async () => {
    if (!draftResult) return;
    let textToCopy = draftResult;
    const match = draftResult.match(/\[💬\s*추천\s*메시지\s*초안\]\s*\n+([\s\S]*?)(?=\n+\[💡|$)/);
    if (match && match[1]?.trim()) {
      textToCopy = match[1].trim();
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("메시지를 복사했습니다. 메신저 앱에 붙여넣으세요.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setErrorNote("복사하지 못했습니다. 본문을 선택해 복사하세요.");
    }
  };

  return (
    <Drawer
      title={`${item.name} 맞춤 연락 초안`}
      subtitle={item.company && item.company !== item.name ? item.company : "Sales Guru 추천"}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <Button variant="outline" size="sm" onClick={() => generateDraft(lens)} disabled={loading}>
            🔄 다시 생성
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              icon="sparkle"
              onClick={() => {
                onClose();
                // 초안을 보낸 뒤의 결과도 같은 공용 기록창으로 남긴다(CRM 시트 전역화).
                onRecord(item, { kind: CHANNEL_PRESET[item.channel] || "kakao" });
              }}
            >
              결과 기록하기
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCopy}
              disabled={loading || !draftResult}
            >
              {copied ? "✓ 복사됨" : "📋 본문 복사"}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            협상 / 대화 렌즈
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "voss", label: "크리스 보스 (No 유도/저항 극복)" },
              { id: "rackham", label: "닐 랙햄 (SPIN 문제 진단)" },
              { id: "jobs", label: "잡스 (극도의 단순/명료함)" },
            ].map((l) => (
              <Button
                key={l.id}
                variant={lens === l.id ? "primary" : "outline"}
                size="xs"
                onClick={() => {
                  setLens(l.id);
                }}
                disabled={loading}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </div>

        <div style={{
          padding: "10px 12px",
          background: "var(--surface-2)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r)",
          fontSize: 12,
          color: "var(--fg-muted)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          <div><strong>연락 이유:</strong> {item.why}</div>
          {item.nextAction && <div><strong>예정 액션:</strong> {item.nextAction}</div>}
          {item.lastNote && <div><strong>최근 대화:</strong> {item.lastNote}</div>}
        </div>

        {errorNote && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{errorNote}</div>}
        <div style={{
          padding: "12px 14px",
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--r)",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--fg)",
          whiteSpace: "pre-wrap",
          minHeight: 140,
        }}>
          {loading ? (
            <div style={{ color: "var(--fg-faint)", display: "flex", alignItems: "center", gap: 8, padding: "20px 0", justifyContent: "center" }}>
              <Iconed name="sparkle" size={14} />
              고객 맞춤 연락 메시지 작성 중…
            </div>
          ) : draftResult ? (
            draftResult
          ) : (
            <span style={{ color: "var(--fg-faint)" }}>초안을 생성해주세요.</span>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function FollowupRow({ item, rail = false, onNavigate, onOpenPanel, onOpenDraft, onRecord, logged, kbSelected }) {
  const stage = stageMeta(item.stage);
  const clickable = Boolean(item.href);

  return (
    <div
      className="hub-row"
      data-kb-row={`${item.kind}-${item.id}`}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--line-soft)",
        boxShadow: rail ? "inset 1px 0 0 var(--danger)" : undefined,
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
        {/* 레일 예산을 넘긴 '지남' 행은 색 대신 글리프 + 직접 라벨로 같은 사실을 말한다. */}
        {item.bucket === "overdue" && !rail && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--fg-muted)" }}>
            <Iconed name="clock" size={12} /> 지남
          </span>
        )}
        <span style={{ color: "var(--fg-muted)" }}>{item.why}</span>
        {item.nextAction && <span style={{ color: "var(--fg-faint)" }}>→ {item.nextAction}</span>}
        {item.kind === "event" && item.whenLabel && <span className="mono" style={{ color: "var(--fg-faint)" }}>{item.whenLabel}</span>}
      </div>
      {item.lastNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--fg-faint)" }}>
          <Iconed name="chat" size={11} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>최근 대화: {item.lastNote}</span>
          {item.lastReaction && <Badge tone="neutral" size="xs" variant="outline">{CRM_REACTION_LABEL[item.lastReaction] || item.lastReaction}</Badge>}
        </div>
      )}

      {item.kind !== "event" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {logged ? (
            <span style={{ fontSize: 12, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Dot tone="neutral" /> 기록됨: {logged}
            </span>
          ) : (
            <>
              <Button variant="outline" size="xs" icon="sparkle" onClick={() => onOpenDraft?.(item)}>
                메시지 초안
              </Button>
              {/* 기록은 어디서 열어도 같은 폼이다(contact-record-form). 행이 제안하는 채널을
                  프리셋으로 넘기고, 가장 잦은 예외인 부재중만 버튼 하나를 더 둔다. */}
              <Button variant="outline" size="xs" icon="edit" onClick={() => onRecord(item, { kind: CHANNEL_PRESET[item.channel] || "call" })}>
                기록
              </Button>
              <Button variant="ghost" size="xs" onClick={() => onRecord(item, { kind: "call", reaction: "no_response" })}>
                부재중
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Followups({ onNavigate }) {
  const toast = useToast();
  const { syncState, items, summary, reload } = useFollowups();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [lane, setLane] = React.useState("all");
  // 버킷은 이제 필터가 아니라 섹션이다(0b). 남는 선택은 "지켜보는 고객"을 펼쳤는지 하나뿐.
  const [restOpen, setRestOpen] = React.useState(false);
  const [recordTarget, setRecordTarget] = React.useState(null); // { item, preset, draft?, error? } — 기록창 대상
  const [logged, setLogged] = React.useState({}); // id → 방금 기록한 채널 라벨
  const [panelItem, setPanelItem] = React.useState(null); // row whose activity panel is open
  const [draftItem, setDraftItem] = React.useState(null); // row whose message draft is open

  const laneCounts = React.useMemo(() => {
    const counts = { all: items.length, lead: 0, deal: 0, event: 0 };
    items.forEach((i) => { counts[i.kind] = (counts[i.kind] || 0) + 1; });
    return counts;
  }, [items]);

  const visible = React.useMemo(() => {
    return items.filter((i) => lane === "all" || i.kind === lane);
  }, [items, lane]);

  // 약속을 어긴 건 → 오늘 하기로 한 건 → 나머지(접힘). 묶음 안 순서는 ledger가 정한 priority 그대로.
  const groups = React.useMemo(() => groupFollowups(visible), [visible]);
  const sections = React.useMemo(() => (
    FOLLOWUP_GROUPS
      .map((group) => ({ ...group, items: groups[group.key] || [] }))
      .filter((group) => group.items.length > 0)
  ), [groups]);

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
  // 키보드 이동 순서는 화면 순서와 같아야 한다 — 접힌 "지켜보는 고객"은 건너뛴다.
  const rendered = React.useMemo(() => (
    sections.flatMap((group) => (group.key === "rest" && !restOpen ? [] : group.items))
  ), [sections, restOpen]);
  const kbRows = React.useMemo(() => rendered.map((i) => ({ id: `${i.kind}-${i.id}` })), [rendered]);
  const kbSelection = useCrmSelection(kbRows);
  useCrmKeyboard({
    selection: kbSelection,
    onEditSelected: (rowId) => {
      const item = rendered.find((i) => `${i.kind}-${i.id}` === rowId);
      if (item) setPanelItem(item);
    },
  });
  React.useEffect(() => {
    if (!kbSelection.selectedId) return;
    document.querySelector(`[data-kb-row="${CSS.escape(kbSelection.selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [kbSelection.selectedId]);

  // 기록은 공용 드로어(contact-record-form)가 소유한다 — 저장·3.5초 되돌리기·늦은 실패 시
  // 입력 복원까지 전부 그 안에 있다. 이 페이지는 "누구를·어느 채널로" 열지만 정한다.
  // 넛지는 큐 위에 붙는다 — "먼저 정리할 것"(act)과 접힌 "정리"(organize).
  const nudgeState = useCrmNudges();
  const actOnNudge = (nudge) => setRecordTarget({
    item: {
      kind: nudge.subject.type === "deal" ? "deal" : "lead",
      id: nudge.subject.id,
      name: nudge.subject.name,
      companyId: nudge.subject.companyId,
    },
    preset: nudge.action?.prefill || {},
    nudge,
  });

  const openRecord = (item, preset) => setRecordTarget({ item, preset });
  const closeRecord = () => setRecordTarget(null);

  // 기록됨 표시는 낙관적으로 붙이되, 확인 토스트는 서버가 saved로 답한 뒤에만 띄운다.
  // 되돌리기·늦은 실패는 표시를 걷고, 실패는 원인과 함께 기록창을 입력 그대로 다시 연다
  // (드로어를 먼저 닫았어도 입력이 조용히 사라지지 않게).
  const onRecordSaved = (saved) => {
    const item = recordTarget?.item;
    if (!item) return;
    setLogged((m) => ({ ...m, [item.id]: saved?.kind ? channelLabel(saved.kind) : "기록" }));
    // 저장은 드로어가 3.5초 뒤에 보낸다 — 그때 큐와 넛지가 새 사실을 반영하도록 다시 읽는다.
    window.setTimeout(() => { reload(); nudgeState.refresh(); }, UNDO_WINDOW_MS + 250);
  };
  const clearLogged = (itemId) => setLogged((m) => {
    if (!(itemId in m)) return m;
    const next = { ...m };
    delete next[itemId];
    return next;
  });
  const onRecordUndone = () => {
    const item = recordTarget?.item;
    if (item) clearLogged(item.id);
  };
  const onRecordPersisted = () => {
    const item = recordTarget?.item;
    if (item) toast.success(`기록됨 · ${item.name}`);
  };
  const onRecordFailed = ({ message, form }) => {
    const target = recordTarget;
    if (!target?.item) return;
    clearLogged(target.item.id);
    toast.error(`기록하지 못했습니다 · ${target.item.name} — ${message}`);
    setRecordTarget((cur) => cur || { item: target.item, preset: target.preset, draft: form, nudge: target.nudge, error: message });
  };
  const onNudgeEscape = async (nudge, action, until) => {
    let result;
    try {
      result = await nudgeState.suppress(nudge, action, until);
    } catch (err) {
      result = { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    if (!result?.ok) toast.error(`넛지를 정리하지 못했습니다 · ${nudge.subject?.name || ""} — ${result?.reason || "저장 실패"}`);
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
        <Button variant="ghost" size="sm" icon="runs" onClick={reload}>새로고침</Button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <SegmentedControl
          label="레인"
          options={LANE_OPTIONS.map((o) => ({ ...o, label: `${o.label} ${laneCounts[o.key] || 0}` }))}
          value={lane}
          onChange={setLane}
        />
      </div>

      {/* 넛지 — 계기·이유·행동 하나. 목록보다 위다: 큐는 "누구"를, 넛지는 "무엇을"을 말한다. */}
      {/* loading은 껍데기도 그리지 않는다 — 빈 Card가 떴다 사라지면 첫 화면이 흔들린다. */}
      {((nudgeState.status !== "live" && nudgeState.status !== "loading") || nudgeState.nudges.length > 0) && (
        <Card pad={false} className="hub-table-card">
          <CrmNudgeSection
            title="먼저 정리할 것"
            hint="캘린더·약속·반응에서 찾은 것"
            state={nudgeState.status}
            nudges={nudgeState.nudges.filter((n) => n.severity === "act")}
            busyKey={nudgeState.busyKey}
            onAct={actOnNudge}
            onEscape={onNudgeEscape}
          />
          <CrmNudgeSection
            title="정리"
            hint="다음 행동이 비었거나 오래 둔 것"
            state={nudgeState.status}
            nudges={nudgeState.nudges.filter((n) => n.severity === "organize")}
            busyKey={nudgeState.busyKey}
            onAct={actOnNudge}
            onEscape={onNudgeEscape}
          />
        </Card>
      )}

      <Card pad={false} className="hub-table-card">
        {sections.length === 0 ? (
          // error를 preview 문구("연결되면 표시됩니다")로 뭉개면 읽기 실패가 "오늘 할 일 없음"으로
          // 보인다 — 후속 누락 0건 목표에서 가장 위험한 오독이라 상태별로 분리한다(§5.3 source truth).
          syncState === "loading" ? (
            // 콜드 로딩을 "연락 데이터 없음"으로 그리면 로딩과 빈 상태가 같은 문구를 쓴다 —
            // §11은 레이아웃이 아는 로딩을 Skeleton으로 그리라고 못박는다(이 파일의 드로어
            // 타임라인도 같은 계약).
            <Skeleton lines={5} height={14} label="연락 목록 불러오는 중" style={{ padding: 16 }} />
          ) : syncState === "error" ? (
            <EmptyState
              icon="clock"
              title="연락 목록을 읽지 못했습니다"
              description="지금 화면은 비어 보이지만 실제 후속 항목이 있을 수 있습니다. 다시 시도해 주세요."
              action={<Button variant="outline" size="sm" onClick={reload}>다시 시도</Button>}
            />
          ) : (
            <EmptyState
              icon="rhythm"
              title={["live", "partial"].includes(syncState) ? "표시할 항목이 없습니다" : "연락 데이터 없음"}
              description={
                syncState !== "live"
                  ? "리드·딜이 쌓이고 Supabase가 연결되면 표시됩니다."
                  : lane === "all"
                    // Q117 확정(2026-08-18): 이 탭은 무접촉 자동 피드가 아니라 선별 표면 —
                    // 내 작업의 '기한 지남 딜'과 기준이 다른 것이 의도임을 카피로 명시한다.
                    ? "컨택 트래킹을 시작한 고객과 다음 연락일이 된 건만 여기 뜹니다. 기한 지남 딜은 자동으로 채우지 않습니다 — 리드 목록에서 트래킹을 시작하면 관리 대상이 됩니다."
                    : "이 필터에 해당하는 항목이 없습니다."
              }
              action={lane !== "all"
                ? <Button variant="outline" size="sm" onClick={() => setLane("all")}>전체 보기</Button>
                : <Button variant="outline" size="sm" icon="leads" onClick={() => onNavigate?.("dashboard/revenue/leads")}>리드 목록 열기</Button>}
            />
          )
        ) : (
          sections.map((group) => {
            const collapsed = group.key === "rest" && !restOpen;
            return (
              <section key={group.key} aria-label={group.label}>
                <div
                  style={{
                    display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
                    padding: "10px 16px", borderBottom: collapsed ? "none" : "1px solid var(--line-soft)",
                    background: "var(--surface-2)",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-dim)" }}>
                    {group.label}
                  </h3>
                  <span className="num" style={{ fontSize: 11.5, color: group.key === "missed" ? "var(--danger)" : "var(--fg-muted)" }}>
                    {group.items.length}
                  </span>
                  {group.hint && !collapsed && (
                    <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>{group.hint}</span>
                  )}
                  <div style={{ flex: 1 }} />
                  {group.key === "rest" && (
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-expanded={restOpen}
                      onClick={() => setRestOpen((open) => !open)}
                    >
                      {restOpen ? "접기" : "펼치기"}
                    </Button>
                  )}
                </div>
                {!collapsed && group.items.map((item, index) => (
                  <FollowupRow
                    key={`${item.kind}-${item.id}`}
                    kbSelected={kbSelection.selectedId === `${item.kind}-${item.id}`}
                    item={item}
                    rail={group.key === "missed" && index < MAX_DANGER_RAILS}
                    onNavigate={onNavigate}
                    onOpenPanel={setPanelItem}
                    onOpenDraft={setDraftItem}
                    onRecord={openRecord}
                    logged={logged[item.id]}
                  />
                ))}
              </section>
            );
          })
        )}
      </Card>
      <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>
        기록한 결과는 crm_activities에 쌓여 내일 우선순위·전환 퍼널에 반영됩니다.
      </div>

      {panelItem && <ActivityPanel item={panelItem} onClose={() => setPanelItem(null)} onNavigate={onNavigate} />}
      {draftItem && <FollowupDraftDrawer item={draftItem} onClose={() => setDraftItem(null)} onRecord={openRecord} />}

      {recordTarget && (
        <ContactRecordDrawer
          target={{
            kind: recordTarget.item.kind,
            id: recordTarget.item.id,
            companyId: recordTarget.item.companyId,
            name: recordTarget.item.name,
          }}
          preset={recordTarget.preset}
          draft={recordTarget.draft || null}
          initialError={recordTarget.error || ""}
          onSaved={onRecordSaved}
          onUndone={onRecordUndone}
          onPersisted={onRecordPersisted}
          onFailed={onRecordFailed}
          onClose={closeRecord}
        />
      )}
    </div>
  );
}
