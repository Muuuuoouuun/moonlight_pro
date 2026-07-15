"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Badge, Button, Card, Checkbox, Dot, EmptyState, SegmentedControl, SyncBadge } from "../hub-primitives";
import { QUICK_LOG_ACTIONS as LOG_ACTIONS, REACTION_OPTIONS } from "@/lib/sales-os/outcome-attribution";
import { DEAL_STAGES, STAGE_ALIASES } from "@/lib/deal-stages";

const STAGE_BY_KEY = Object.fromEntries(DEAL_STAGES.map((s) => [s.key, s]));
function stageMeta(rawStage) {
  if (!rawStage) return null;
  const key = STAGE_ALIASES[rawStage] || rawStage;
  return STAGE_BY_KEY[key] || null;
}

const CHANNEL_ICON = { "전화/문자": "chat", "방문": "building", "카톡": "chat", "일정": "calendar" };

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
const LANE_TONE = { lead: "moon", deal: "company", event: "info" };
const BUCKET_STRIPE = { overdue: "var(--danger-line)", today: "var(--warning-line)" };

function useFollowups() {
  const [state, setState] = React.useState({ syncState: "loading", items: [], summary: {}, calendarReason: "" });

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, syncState: "loading" }));
    try {
      const r = await fetch("/api/hub/followups", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) {
        setState((s) => ({ ...s, syncState: "error" }));
        return;
      }
      setState({
        syncState: d.status === "live" ? "live" : "preview",
        items: Array.isArray(d.items) ? d.items : [],
        summary: d.summary || {},
        calendarReason: d.calendarReason || "",
      });
    } catch {
      setState((s) => ({ ...s, syncState: "error" }));
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Inline min-record capture (operator-workflow-profile.md §7 확정): 대화 요약 + 고객 반응 +
// 다음 행동과 날짜(또는 기약 없음). Replaces the old fire-immediately quick-log tap — a single
// tap used to write nothing but the action tag, which fell short of the confirmed requirement.
function LogForm({ item, action, label, onCancel, onSubmit, submitting }) {
  const [summary, setSummary] = React.useState("");
  const [reaction, setReaction] = React.useState(null);
  const [nextAction, setNextAction] = React.useState("");
  const [at, setAt] = React.useState("");
  const [dormant, setDormant] = React.useState(false);

  const canSubmit = Boolean(dormant || at) && !submitting;

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

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
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

function FollowupRow({ item, onNavigate, logDraft, onOpenLog, onCloseLog, onSubmitLog, submitting, logged }) {
  const stage = stageMeta(item.stage);
  const clickable = Boolean(item.href);
  const isLogging = logDraft?.itemId === item.id;

  return (
    <div
      className="hub-row"
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--line-soft)",
        boxShadow: BUCKET_STRIPE[item.bucket] ? `inset 2px 0 0 ${BUCKET_STRIPE[item.bucket]}` : undefined,
        opacity: logged ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Iconed name={CHANNEL_ICON[item.channel] || "chat"} size={14} style={{ color: "var(--moon-300)" }} />
        <span
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onNavigate?.(item.href) : undefined}
          onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.(item.href); } } : undefined}
          style={{ fontSize: 13.5, fontWeight: 500, cursor: clickable ? "pointer" : "default" }}
        >
          {item.name}
        </span>
        {item.company && item.company !== item.name && (
          <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>· {item.company}</span>
        )}
        {item.kind !== "event" && <Badge tone={LANE_TONE[item.kind]} size="xs" variant="outline">{LANE_LABEL[item.kind]}</Badge>}
        {stage && <Badge tone={stage.color} size="xs">{stage.label}</Badge>}
        <Badge tone="moon" size="xs">{item.channel}</Badge>
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
            item={item}
            action={logDraft.action}
            label={logDraft.label}
            submitting={submitting}
            onCancel={onCloseLog}
            onSubmit={(fields) => onSubmitLog(item, logDraft.action, logDraft.label, fields)}
          />
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {logged ? (
              <span style={{ fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 6 }}>
                <Dot tone="success" /> 기록됨: {logged}
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
  const { syncState, items, summary, calendarReason, reload } = useFollowups();
  const [lane, setLane] = React.useState("all");
  const [bucket, setBucket] = React.useState("all");
  const [logDraft, setLogDraft] = React.useState(null); // { itemId, action, label }
  const [submitting, setSubmitting] = React.useState(false);
  const [logged, setLogged] = React.useState({}); // id → action label

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

  const openLog = (item, action, label) => setLogDraft({ itemId: item.id, action, label });
  const closeLog = () => setLogDraft(null);

  const submitLog = async (item, action, label, { summary, reaction, nextAction, at, dormant }) => {
    setSubmitting(true);
    try {
      await fetch("/api/integrations/outcomes/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: item.kind === "lead" ? item.id : null,
          dealId: item.kind === "deal" ? item.id : null,
          channel: item.channel,
          action,
          play: "followup",
          note: summary || null,
          reaction: reaction || null,
          nextAction: {
            text: nextAction || null,
            at: dormant ? null : at || null,
            dormant: Boolean(dormant),
          },
        }),
      });
      setLogged((m) => ({ ...m, [item.id]: label }));
      setLogDraft(null);
      await reload();
    } catch {
      /* non-fatal — leave the form open so the operator can retry */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1100 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>팔로업</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            오늘 연락할 사람 · 채널 · 왜 · 다음 행동
            {syncState === "live" && (summary.overdue ?? 0) > 0 && (
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
        <SegmentedControl
          label="버킷"
          options={BUCKET_OPTIONS.map((o) => ({ ...o, label: `${o.label} ${bucketCounts[o.key] || 0}` }))}
          value={bucket}
          onChange={setBucket}
        />
      </div>

      {summary.events === 0 && calendarReason && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--fg-muted)" }}>
          <SyncBadge state="preview" />
          Google Calendar 미연결 — 리드·딜 후속만 표시 중입니다.
          <Button variant="ghost" size="xs" onClick={() => onNavigate?.("dashboard/work/calendar")}>연결</Button>
        </div>
      )}

      <Card pad={false} className="hub-table-card">
        {visible.length === 0 ? (
          <EmptyState
            icon="rhythm"
            title={syncState === "live" ? "표시할 항목이 없습니다" : "팔로업 데이터 없음"}
            description={
              syncState !== "live"
                ? "리드·딜이 쌓이고 Supabase가 연결되면 표시됩니다."
                : lane === "all" && bucket === "all"
                  ? "정체된 리드·딜이 생기면 여기에 우선순위로 뜹니다."
                  : "이 필터에 해당하는 항목이 없습니다."
            }
            action={lane !== "all" || bucket !== "all" ? <Button variant="outline" size="sm" onClick={() => { setLane("all"); setBucket("all"); }}>전체 보기</Button> : undefined}
          />
        ) : (
          visible.map((item) => (
            <FollowupRow
              key={`${item.kind}-${item.id}`}
              item={item}
              onNavigate={onNavigate}
              logDraft={logDraft}
              onOpenLog={openLog}
              onCloseLog={closeLog}
              onSubmitLog={submitLog}
              submitting={submitting}
              logged={logged[item.id]}
            />
          ))
        )}
      </Card>
      <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>
        기록한 결과는 outreach_outcomes에 쌓여 내일 우선순위·전환 퍼널에 반영됩니다.
      </div>
    </div>
  );
}
