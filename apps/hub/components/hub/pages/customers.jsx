"use client";

// 고객 DB — Leads·Accounts 통합 뷰 (2026-07-16 CRM 와이어프레임 '고객 DB' 화면).
// 한 테이블에서 리드(영업 진행)와 계정(계약 고객)을 함께 보고, 행 클릭으로 Contact 중심
// Customer 360 드로어를 연다. 세그먼트는 원장 데이터에서 계산한다 — 근거 없는 세그먼트
// (재계약 임박 등 소스가 없는 것)는 만들지 않는다.

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import {
  Badge, Card, Button, Avatar, Input, EmptyState, SyncBadge, Kbd, Drawer,
  SegmentedControl, Divider, Checkbox,
} from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { useRevenueLedger, saveRevenueRecord, LeadEnrichmentPanel, SortHead } from "./revenue";
import { DEAL_STAGES, STAGE_FILL } from "@/lib/deal-stages";

// "₩1.2M"/"₩900K"/"—" → 정렬용 숫자 (DESIGN.md §8.1: 금액은 표시 문자열을 파싱해 정렬)
function parseMoney(value) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").replace(/[₩,\s]/g, "");
  const m = /^(-?\d*\.?\d+)([mMkK]?)$/.exec(raw);
  if (!m) return 0;
  let n = Number(m[1]);
  if (m[2].toLowerCase() === "m") n *= 1_000_000;
  if (m[2].toLowerCase() === "k") n *= 1_000;
  return Number.isFinite(n) ? n : 0;
}

const fmtMoney = v => {
  const n = Number(v) || 0;
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₩${(n / 1_000).toFixed(0)}K`;
  return n ? `₩${n}` : "—";
};

// lead score(0-100) → 계정 health와 같은 3밴드로 접어 한 컬럼에서 읽게 한다
function scoreBand(score) {
  if (!Number.isFinite(score)) return null;
  if (score < 40) return "risk";
  if (score < 70) return "warning";
  return "ok";
}

// health는 점수 밴드 — 신호등 금지(§5.2). 이탈 위험(risk)만 danger, 나머지는 중립.
const HEALTH_TONE = { ok: "neutral", warning: "neutral", risk: "danger" };
const LEAD_STAGE_ORDER = { New: 0, Contact: 1, Qualified: 2, Customer: 3, Lost: 4 };

// 통합 행 모델: 리드와 계정을 같은 컬럼 계약으로 투영
function toRows(ledger) {
  const contactsByCompany = new Map();
  (ledger.contacts || []).forEach(c => {
    if (c.companyId && !contactsByCompany.has(c.companyId)) contactsByCompany.set(c.companyId, c);
  });

  // 딜 조인 인덱스 — 리드는 leadId, 계정은 companyId로 붙는다
  const dealsByLead = new Map();
  const dealsByCompany = new Map();
  (ledger.deals || []).forEach(d => {
    if (d.leadId) {
      if (!dealsByLead.has(d.leadId)) dealsByLead.set(d.leadId, []);
      dealsByLead.get(d.leadId).push(d);
    }
    if (d.companyId) {
      if (!dealsByCompany.has(d.companyId)) dealsByCompany.set(d.companyId, []);
      dealsByCompany.get(d.companyId).push(d);
    }
  });

  const leadRows = (ledger.leads || []).map(l => {
    const contact = l.contactId
      ? (ledger.contacts || []).find(c => c.id === l.contactId)
      : (l.companyId ? contactsByCompany.get(l.companyId) : null);
    // crm_activities/deals는 대부분 company_id로만 연결된다 (lead_id는 극소수) — lead 자신의
    // id로만 조인하면 Customer 360 드로어의 활동·딜이 항상 비어 보인다. leadId 매칭에
    // companyId 매칭을 더해 합친다 (둘 다 걸리는 딜은 id로 중복 제거).
    const leadDeals = dealsByLead.get(l.id) || [];
    const companyDeals = l.companyId ? (dealsByCompany.get(l.companyId) || []) : [];
    const seenDealIds = new Set(leadDeals.map(d => d.id));
    const mergedDeals = [...leadDeals, ...companyDeals.filter(d => !seenDealIds.has(d.id))];
    return {
      key: `lead:${l.id}`,
      kind: "lead",
      id: l.id,
      companyId: l.companyId || null,
      name: l.name,
      person: contact?.name || l.contactName || null,
      personTitle: contact?.title || null,
      phone: contact?.phone || null,
      email: contact?.email || l.contactEmail || null,
      sub: [l.region, l.source !== "—" ? l.source : null].filter(Boolean).join(" · "),
      stage: l.stage,
      stageOrder: LEAD_STAGE_ORDER[l.stage] ?? 0,
      health: scoreBand(l.score),
      healthScore: Number.isFinite(l.score) ? l.score : null,
      nextAction: l.nextAction || "",
      focusOverride: l.focusOverride || "default",
      valueNum: parseMoney(l.value),
      dormant: Boolean(l.dormant),
      dormantSince: l.dormantSince,
      tags: Array.isArray(l.enrichmentTags) ? l.enrichmentTags : [],
      isNew: l.stage === "New",
      workspace: l.workspace,
      brand: l.brand,
      type: l.type,
      deals: mergedDeals,
      raw: l, // 스코어 요약(LeadEnrichmentPanel)이 원본 enrichment 필드를 쓴다
    };
  });

  const accountRows = (ledger.accounts || []).map(a => {
    const contact = a.companyId ? contactsByCompany.get(a.companyId) : null;
    return {
      key: `account:${a.id || a.name}`,
      kind: "account",
      id: a.id || null,
      companyId: a.companyId || null,
      name: a.name,
      person: contact?.name || null,
      personTitle: contact?.title || null,
      phone: contact?.phone || null,
      email: contact?.email || null,
      sub: `계약 고객 · 딜 ${a.deals}건`,
      stage: "고객",
      stageOrder: 90,
      health: a.health,
      healthScore: null,
      nextAction: a.nextAction || "",
      focusOverride: a.focusOverride || "default",
      valueNum: Number(a.value) || 0,
      dormant: false,
      tags: [],
      isNew: false,
      type: a.type,
      deals: (a.companyId && dealsByCompany.get(a.companyId)) || [],
      raw: null,
    };
  });

  return [...leadRows, ...accountRows];
}

const SEGMENTS = [
  { key: "all", label: "전체" },
  { key: "risk", label: "이탈위험" },
  { key: "new", label: "신규" },
  { key: "dormant", label: "기약 없음" },
  { key: "customer", label: "계약 고객" },
];

function segmentFilter(row, seg) {
  if (seg === "risk") return row.health === "risk" && !row.dormant;
  if (seg === "new") return row.isNew;
  if (seg === "dormant") return row.dormant;
  if (seg === "customer") return row.kind === "account";
  return true;
}

// ── Customer 360 드로어 ──────────────────────────────────────────────────────
// Contact(사람) 중심 헤더 + 활동 타임라인 + 빠른 기록. 컨택 완료 시트·포커스
// 오버라이드는 이 패널에 슬롯이 있다 (Phase 1C / focus_override 작업).

const ACT_ICON = { email: "email", meeting: "calendar", call: "signal", note: "edit", deal: "deals", kakao: "chat", quote: "orders", ai: "sparkle", info_session: "brief", demo: "play", visit: "building", update: "rhythm" };
const ACT_LABEL = { email: "이메일", meeting: "미팅", call: "통화", note: "노트", deal: "딜", kakao: "카카오", quote: "견적", ai: "AI", info_session: "설명회", demo: "데모", visit: "방문", update: "업데이트" };

function ActivityTimeline({ rows }) {
  if (!rows.length) {
    return <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "10px 0" }}>아직 기록이 없습니다. 아래에서 첫 기록을 남기세요.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((a, i) => (
        <div key={a.id || i} style={{
          display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, padding: "9px 0",
          borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "none",
          alignItems: "flex-start",
        }}>
          <span style={{ color: "var(--fg-muted)", marginTop: 1 }}>
            <Iconed name={ACT_ICON[a.type] || "edit"} size={13} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.msg}</div>
            <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 2 }}>{ACT_LABEL[a.type] || a.type}</div>
          </div>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>{a.at}</span>
        </div>
      ))}
    </div>
  );
}

function QuickLog({ onSave }) {
  const [type, setType] = React.useState("call");
  const [text, setText] = React.useState("");
  const save = () => {
    const body = text.trim();
    if (!body) return;
    onSave({ type, body });
    setText("");
  };
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="통화·미팅 메모를 입력하면 타임라인에 쌓여요"
        rows={2}
        style={{ width: "100%", resize: "vertical", background: "transparent", border: "none", outline: "none", color: "var(--fg)", fontSize: 12.5, fontFamily: "inherit", lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ height: 30, padding: "0 8px", fontSize: 12.5, background: "var(--surface-3)", color: "var(--fg)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", outline: "none" }}>
          {["call", "kakao", "meeting", "email", "visit", "quote", "note"].map(k => (
            <option key={k} value={k}>{ACT_LABEL[k]}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="xs" onClick={save}>기록 저장</Button>
      </div>
    </div>
  );
}

// ── 컨택 완료 시트 (Phase 1C) ────────────────────────────────────────────────
// 통화·미팅을 끝냈을 때 "1줄 요약 + 반응 + 다음 액션(날짜) 또는 기약 없음"을
// record_contact_outcome_v1 원자 RPC로 남긴다. 반응·요약 없이는 저장 불가,
// 다음 액션 없이 저장하려 하면 경고를 먼저 보여준다 (spec §10).

const REACTIONS = [
  { key: "positive", label: "긍정" },
  { key: "neutral", label: "중립" },
  { key: "concern", label: "우려" },
  { key: "rejected", label: "거절" },
  { key: "no_response", label: "무응답" },
];
const OUTCOME_KINDS = ["call", "kakao", "meeting", "visit", "demo", "email"];

function ContactOutcomeSheet({ row, onSaved, onUndone }) {
  const [kind, setKind] = React.useState("call");
  const [reaction, setReaction] = React.useState(null);
  const [summary, setSummary] = React.useState("");
  const [nextAction, setNextAction] = React.useState("");
  const [nextAt, setNextAt] = React.useState("");
  const [dormant, setDormant] = React.useState(false);
  const [state, setState] = React.useState("idle"); // idle | warn | saving | error
  const [errorMsg, setErrorMsg] = React.useState("");

  const reset = () => {
    setReaction(null); setSummary(""); setNextAction(""); setNextAt("");
    setDormant(false); setState("idle"); setErrorMsg("");
  };
  const [pendingUndo, setPendingUndo] = React.useState(null);

  // followups submitLog와 같은 deferred-write 계약(5차 재감사 M: 같은 최고 빈도 액션이
  // 진입점에 따라 되돌리기 유무가 갈렸다): 즉시 반영+3.5초 되돌리기, 창이 닫히면 POST,
  // 늦은 실패 시 입력 복원+명명.
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  const persist = async (payload, snapshot) => {
    try {
      const resp = await fetch("/api/hub/revenue/contact-outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.status === "saved") return;
      // 늦은 실패 — 입력 복원 + 원인 명명 (낙관 행 제거는 onUndone이 담당)
      onUndone?.(snapshot.optimisticId);
      setKind(snapshot.kind); setSummary(snapshot.summary); setReaction(snapshot.reaction);
      setNextAction(snapshot.nextAction); setNextAt(snapshot.nextAt); setDormant(snapshot.dormant);
      setState("error");
      setErrorMsg(`${data.error || data.reason || "저장에 실패했습니다."} — 입력을 복원했습니다.`);
    } catch (err) {
      onUndone?.(snapshot.optimisticId);
      setKind(snapshot.kind); setSummary(snapshot.summary); setReaction(snapshot.reaction);
      setNextAction(snapshot.nextAction); setNextAt(snapshot.nextAt); setDormant(snapshot.dormant);
      setState("error");
      setErrorMsg(`${err instanceof Error ? err.message : String(err)} — 입력을 복원했습니다.`);
    }
  };

  const save = ({ ignoreWarning = false } = {}) => {
    if (!summary.trim() || !reaction) return;
    // 다음 액션도 기약 없음도 없으면 저장 전 1회 경고 (열린 건을 공백으로 두지 않기)
    if (!dormant && !nextAction.trim() && !ignoreWarning) {
      setState("warn");
      return;
    }
    const optimisticId = `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const snapshot = { optimisticId, kind, summary: summary.trim(), reaction, nextAction: nextAction.trim(), nextAt, dormant };
    const payload = {
      entityType: row.kind === "account" ? "account" : "lead",
      entityId: row.id,
      kind,
      summary: summary.trim(),
      reaction,
      nextAction: dormant ? null : (nextAction.trim() || null),
      nextActionAt: dormant ? null : (nextAt || null),
      dormant,
    };
    onSaved({
      activityId: optimisticId,
      kind,
      summary: summary.trim(),
      reaction,
      nextAction: dormant ? "기약 없음 (휴면)" : nextAction.trim(),
      dormant,
    });
    reset();
    const key = `contact-${optimisticId}`;
    scheduleUndoable(key, () => {
      setPendingUndo((cur) => (cur?.key === key ? null : cur)); // 창 닫힘 — 죽은 버튼 방지
      persist(payload, snapshot);
    });
    setPendingUndo({
      key,
      label: "기록됨",
      undo: () => {
        if (cancelUndoable(key)) {
          onUndone?.(optimisticId);
          setKind(snapshot.kind); setSummary(snapshot.summary); setReaction(snapshot.reaction);
          setNextAction(snapshot.nextAction); setNextAt(snapshot.nextAt); setDormant(snapshot.dormant);
        }
        setPendingUndo(null);
      },
    });
  };

  const canSave = Boolean(summary.trim() && reaction) && state !== "saving";

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>컨택 완료 기록</span>
        <select value={kind} onChange={e => setKind(e.target.value)} style={{ height: 30, padding: "0 8px", fontSize: 12.5, background: "var(--surface-3)", color: "var(--fg)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", outline: "none" }}>
          {OUTCOME_KINDS.map(k => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}
        </select>
      </div>

      <div>
        <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginBottom: 5 }}>고객 반응 (필수)</div>
        <SegmentedControl
          label="고객 반응"
          options={REACTIONS.map(r => ({ key: r.key, label: r.label }))}
          value={reaction}
          onChange={setReaction}
          style={{ flexWrap: "wrap", background: "none", border: "none", padding: 0 }}
        />
      </div>

      <div>
        <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginBottom: 5 }}>1줄 요약 (필수)</div>
        <input
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="예) 결정권자 참석 합의, 계약 조건 이견 없음"
          style={{ width: "100%", height: 32, padding: "0 10px", fontSize: 12.5, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", color: "var(--fg)", outline: "none" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto", gap: 6, alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginBottom: 5 }}>다음 액션</div>
          <input
            value={nextAction}
            onChange={e => { setNextAction(e.target.value); if (state === "warn") setState("idle"); }}
            placeholder="계약서 발송"
            disabled={dormant}
            style={{ width: "100%", height: 32, padding: "0 10px", fontSize: 12.5, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", color: "var(--fg)", outline: "none", opacity: dormant ? 0.45 : 1 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginBottom: 5 }}>날짜</div>
          <input
            type="date"
            value={nextAt}
            onChange={e => setNextAt(e.target.value)}
            disabled={dormant}
            className="mono"
            style={{ width: "100%", height: 32, padding: "0 8px", fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", color: "var(--fg)", outline: "none", opacity: dormant ? 0.45 : 1 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32 }}>
          <Checkbox
            checked={dormant}
            onChange={(v) => { setDormant(v); if (state === "warn") setState("idle"); }}
            label="기약 없음"
          />
          <span style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>기약 없음</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.4 }}>
          {state === "warn" && (
            <span style={{ color: "var(--fg-muted)" }}>다음 액션이 비어 있습니다. 그래도 저장하려면 한 번 더 누르세요.</span>
          )}
          {state === "error" && <span role="alert" style={{ color: "var(--danger)" }}>{errorMsg}</span>}
          {pendingUndo && (
            <span role="status" aria-live="polite" style={{ color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {pendingUndo.label}
              <Button variant="ghost" size="xs" onClick={pendingUndo.undo}>되돌리기</Button>
            </span>
          )}
        </div>
        <Button
          variant="primary"
          size="xs"
          disabled={!canSave}
          onClick={() => save({ ignoreWarning: state === "warn" })}
        >
          {state === "saving" ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}

// 딜 1건의 미니 파이프라인 레일 — 6단계 퍼널에서 현재 단계까지 채워 읽는 계기.
// 색은 deal-stages.js STAGE_FILL(퍼널 히트맵)만 사용, 패배 딜은 레일 대신 라벨.
function DealStageRail({ stage }) {
  if (stage === "lost") {
    return <Badge tone="neutral" size="xs" variant="outline">패배</Badge>;
  }
  const idx = DEAL_STAGES.findIndex(s => s.key === stage);
  const cur = idx >= 0 ? idx : 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title={DEAL_STAGES[cur].label}>
      {DEAL_STAGES.map((s, i) => (
        <span
          key={s.key}
          style={{
            width: 14, height: 4, borderRadius: 2,
            background: i < cur ? "var(--moon-600)" : i === cur ? STAGE_FILL[s.ramp] : "var(--surface-3)",
          }}
        />
      ))}
      <span style={{ fontSize: 10.5, color: "var(--fg-muted)", marginLeft: 4 }}>{DEAL_STAGES[cur].label}</span>
    </span>
  );
}

function DealPipelineSection({ deals }) {
  if (!deals.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>딜 파이프라인 · {deals.length}건</div>
      {deals.map(d => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "8px 11px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
            <div style={{ marginTop: 4 }}><DealStageRail stage={d.stage} /></div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="num" style={{ fontSize: 12.5, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(d.value)}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 2 }}>마감 {d.close}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Customer360Drawer({ row, onClose, onNavigate }) {
  const [activities, setActivities] = React.useState([]);
  const [actSync, setActSync] = React.useState("loading");
  // 컨택 완료 시트 저장 직후 부모 원장 재조회 없이 최신 다음 액션을 반영
  const [nextActionOverride, setNextActionOverride] = React.useState(null);
  const [focusOverride, setFocusOverride] = React.useState(row.focusOverride || "default");

  // company_id를 함께 실어 쓴다 — 활동을 새로 남길 때도 이후 회사 단위 조회에 걸리도록.
  const linkParam = {
    ...(row.kind === "account" ? { accountId: row.id } : { leadId: row.id }),
    ...(row.companyId ? { companyId: row.companyId } : {}),
  };

  // companyId 우선 조회 — live crm_activities는 대부분 company_id로만 연결되고 lead_id/
  // account_id는 극소수만 채워져 있다 (followups.jsx ActivityPanel과 동일한 조인 규칙).
  // 자신의 id로만 걸면 이 드로어의 활동 타임라인이 사실상 항상 비어 보인다.
  const reload = React.useCallback(() => {
    if (!row.id) { setActSync("preview"); return; }
    const qs = row.companyId
      ? `companyId=${encodeURIComponent(row.companyId)}`
      : row.kind === "account"
        ? `accountId=${encodeURIComponent(row.id)}`
        : `leadId=${encodeURIComponent(row.id)}`;
    fetch(`/api/hub/revenue/activity?${qs}`, { cache: "no-store" })
      .then(r => {
        // 5xx를 preview로 오독하면 "기록 없음"으로 보인다 — 읽기 실패는 error(§5.3).
        if (!r.ok) throw new Error(`activity ${r.status}`);
        return r.json();
      })
      .then(d => {
        setActivities(Array.isArray(d.activities) ? d.activities : []);
        setActSync(d.status === "live" ? "live" : "preview");
      })
      .catch(() => setActSync("error"));
  }, [row.id, row.kind, row.companyId]);

  React.useEffect(() => { reload(); }, [reload]);

  const [actError, setActError] = React.useState(null);
  const logActivity = ({ type, body }) => {
    const temp = { id: `local-${Date.now()}`, type, msg: body, at: "방금" };
    setActError(null);
    setActivities(prev => [temp, ...prev]);
    if (!row.id) return;
    saveRevenueRecord("activity", "create", { ...linkParam, type, body }).then(r => {
      if (r.ok && r.id) {
        setActivities(prev => prev.map(a => (a.id === temp.id ? { ...a, id: r.id } : a)));
        return;
      }
      // 저장 실패한 낙관적 행을 남겨두면 다음 리로드 때 소리 없이 사라진다 — 즉시 걷어내고
      // 입력 내용을 에러에 실어 되살릴 수 있게 표시한다(무언 롤백 금지).
      setActivities(prev => prev.filter(a => a.id !== temp.id));
      setActError({ body, message: r.status === "preview" ? "Supabase 미설정 — 기록이 저장되지 않았습니다." : "기록 저장에 실패했습니다. 다시 시도하세요." });
    });
  };

  // 이 드로어는 접촉 기록용 360 뷰 — 이름·연락처·단계의 원본 편집은 리드 정식 편집기
  // (?lead= 딥링크)가 담당한다. 계약 고객(account)은 아직 ?account= 딥링크가 없어
  // followups ActivityPanel과 같은 규칙으로 링크를 숨긴다.
  const editHref = row.kind !== "account" && row.id
    ? `dashboard/revenue/leads?lead=${encodeURIComponent(row.id)}`
    : null;

  return (
    <Drawer
      title={row.person || row.name}
      subtitle={row.person ? `${row.name}${row.personTitle ? ` · ${row.personTitle}` : ""}` : (row.sub || null)}
      onClose={onClose}
      width="min(440px, 96vw)"
      footer={editHref ? <Button variant="outline" size="sm" onClick={() => onNavigate?.(editHref)}>정식 편집 열기</Button> : undefined}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 헤더 요약 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {row.health && (
            <Badge tone={HEALTH_TONE[row.health]} size="xs">
              {row.healthScore != null ? `스코어 ${row.healthScore}` : `건강도 ${row.health}`}
            </Badge>
          )}
          <Badge tone="neutral" size="xs" variant="outline">
            {row.kind === "account" ? "계약 고객" : row.stage}
          </Badge>
          {row.dormant && <Badge tone="neutral" size="xs" variant="outline">기약 없음</Badge>}
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 15 }}>{fmtMoney(row.valueNum)}</span>
        </div>

        {/* 연락처 */}
        {(row.phone || row.email) && (
          <div className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
            {row.phone && <span>{row.phone}</span>}
            {row.email && <span>{row.email}</span>}
          </div>
        )}

        {/* 딜 파이프라인 — 이 고객에 걸린 딜의 단계·금액·마감 간이 계기 */}
        <DealPipelineSection deals={row.deals || []} />

        {/* 스코어 요약 — 리드 enrichment 분류·증거 (점수 산출 근거의 간이 표기) */}
        {row.raw && <LeadEnrichmentPanel lead={row.raw} />}

        {/* 포커스 오버라이드 — 숫자 편집 없이 3단 조정만 (spec §7 확정 규칙) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>포커스</span>
          <SegmentedControl
            label="포커스 조정"
            options={[
              { key: "lower", label: "내리기" },
              { key: "default", label: "기본" },
              { key: "raise", label: "올리기" },
            ]}
            value={focusOverride}
            onChange={(next) => {
              const prevValue = focusOverride;
              setFocusOverride(next);
              if (!row.id) return;
              saveRevenueRecord(row.kind === "account" ? "account" : "lead", "update", {
                id: row.id,
                focusOverride: next,
              }).then(r => {
                // 실패하면 토글을 원위치 — 저장 안 된 값이 계속 선택돼 보이면 안 된다.
                if (!r?.ok) setFocusOverride(prevValue);
              });
            }}
          />
        </div>

        {/* 다음 액션 */}
        {(nextActionOverride ?? row.nextAction) && (
          <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <Iconed name="bolt" size={13} style={{ color: "var(--moon-300)" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: "var(--fg-faint)" }}>다음 액션</div>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{nextActionOverride ?? row.nextAction}</div>
            </div>
          </div>
        )}

        {/* 컨택 완료 시트 — Phase 1C 핵심 루프 */}
        <ContactOutcomeSheet
          row={row}
          onSaved={(o) => {
            setActivities(prev => [
              { id: o.activityId, type: o.kind, msg: o.summary, at: "방금", reaction: o.reaction },
              ...prev,
            ]);
            setNextActionOverride(o.nextAction || null);
          }}
          onUndone={(optimisticId) => {
            setActivities(prev => prev.filter(a => a.id !== optimisticId));
            setNextActionOverride(null);
          }}
        />

        <Divider />

        {/* 활동 타임라인 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>활동 타임라인</span>
            <SyncBadge state={actSync} />
          </div>
          <ActivityTimeline rows={activities} />
        </div>

        {/* 빠른 기록 */}
        {actError && (
          <div role="alert" style={{ fontSize: 11.5, color: "var(--danger)", lineHeight: 1.5 }}>
            {actError.message}
            {actError.body && <span style={{ color: "var(--fg-muted)" }}> · 입력: “{actError.body}”</span>}
          </div>
        )}
        <QuickLog onSave={logActivity} />
      </div>
    </Drawer>
  );
}

// ── 페이지 ──────────────────────────────────────────────────────────────────

export function Customers({ onNavigate }) {
  const { ledger, syncState } = useRevenueLedger();
  const [segment, setSegment] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState({ key: null, dir: "asc" });
  const [openKey, setOpenKey] = React.useState(null);
  const [createError, setCreateError] = React.useState(null);

  const allRows = React.useMemo(() => toRows(ledger), [ledger]);

  // 딥링크: ?customer=<kind>:<id> — 원장 로드 후 1회만 열고 쿼리 소거 (DESIGN §8.1)
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const deepLinkDone = React.useRef(false);
  React.useEffect(() => {
    // 원장이 아직 로드 전(loading)일 때만 대기 — 빈/preview DB에서도 파라미터를 소비하고
    // 설명한다(기존: 빈 원장이면 ?customer= 링크가 영원히 무시·무설명, 4차 재감사 S).
    if (deepLinkDone.current || syncState === 'loading') return;
    const target = searchParams?.get("customer");
    if (!target) { deepLinkDone.current = true; return; }
    deepLinkDone.current = true;
    if (allRows.some(r => r.key === target)) setOpenKey(target);
    else setCreateError('링크의 고객을 찾을 수 없습니다 — 원장이 비어 있거나 항목이 삭제됐습니다.');
    router.replace(pathname, { scroll: false });
  }, [allRows, searchParams, router, pathname, syncState]);

  const term = search.trim().toLowerCase();
  const filtered = allRows.filter(r =>
    segmentFilter(r, segment) &&
    (!term || r.name.toLowerCase().includes(term) || (r.person || "").toLowerCase().includes(term) || (r.sub || "").toLowerCase().includes(term))
  );

  // 정렬: 헤더 클릭 asc → desc → 해제 3단 (DESIGN §8.1). 해제 시 원장 순서.
  const cycleSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };
  const sorted = React.useMemo(() => {
    if (!sort.key) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = r => sort.key === "value" ? r.valueNum
      : sort.key === "stage" ? r.stageOrder
      : sort.key === "health" ? ({ risk: 0, warning: 1, ok: 2 }[r.health] ?? 3)
      : r.name;
    return [...filtered].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (typeof av === "string") return av.localeCompare(bv, "ko") * dir;
      return (av - bv) * dir;
    });
  }, [filtered, sort]);

  // N 단축키: 드로어 닫힘 + 입력 포커스 밖일 때 새 고객(리드) 생성.
  // creatingRef: 이 생성은 즉시 영속 write라 연타/저장 지연 중 재진입을 막지 않으면
  // "새 고객" 행이 원장에 줄줄이 쌓인다.
  const creatingRef = React.useRef(false);
  const createCustomer = React.useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreateError(null);
    saveRevenueRecord("lead", "create", { name: "새 고객", stage: "New" })
      .then(r => {
        if (r.ok && r.id) setOpenKey(`lead:${r.id}`);
        else setCreateError(`고객 생성 실패 (${r.status}) — 다시 시도하세요.`); // 무언 실패 금지(재감사 M)
      })
      .finally(() => { creatingRef.current = false; });
  }, []);
  // 키보드 계층(2026-08-05 배선): j/k 행 이동 · e 열기 · n 생성 · / 검색 · Esc 해제.
  // 수제 N 리스너를 훅으로 흡수 — 입력/드로어(role=dialog)/치트시트에서는 훅이 양보하고,
  // 연타 재진입은 createCustomer의 creatingRef가 막는다.
  const searchRef = React.useRef(null);
  const kbRows = React.useMemo(() => sorted.map(r => ({ id: r.key })), [sorted]);
  const selection = useCrmSelection(kbRows);
  useCrmKeyboard({
    selection,
    onNew: createCustomer,
    onEditSelected: (key) => setOpenKey(key),
    onSearchFocus: () => searchRef.current?.focus(),
  });
  React.useEffect(() => {
    if (!selection.selectedId) return;
    document.querySelector(`[data-customer-row="${CSS.escape(selection.selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selection.selectedId]);

  const counts = React.useMemo(() => {
    const c = {};
    for (const s of SEGMENTS) c[s.key] = allRows.filter(r => segmentFilter(r, s.key)).length;
    return c;
  }, [allRows]);

  const openRow = sorted.find(r => r.key === openKey) || allRows.find(r => r.key === openKey) || null;

  const gridCols = "minmax(0,2.1fr) 0.9fr 0.9fr 1.3fr 0.9fr";

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>고객 DB</h2>
          {createError && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{createError}</div>}
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            리드 {ledger.leads?.length || 0} · 계약 고객 {ledger.accounts?.length || 0}
            <SyncBadge state={syncState} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Input ref={searchRef} className="hub-toolbar" placeholder="학원명·담당자·지역 검색…" icon="search" value={search} onChange={setSearch} />
        <Button variant="primary" size="sm" icon="plus" onClick={createCustomer}>고객 등록 <Kbd>N</Kbd></Button>
      </div>

      <SegmentedControl
        label="고객 세그먼트"
        options={SEGMENTS.map(s => ({ key: s.key, label: s.label, count: counts[s.key] }))}
        value={segment}
        onChange={setSegment}
      />

      <Card pad={false} style={{ overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "9px 16px",
          background: "var(--surface-2)", borderBottom: "1px solid var(--line)",
          fontSize: 10.5, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--fg-faint)",
        }}>
          {/* 인라인 정렬 헤더 3중 복제 제거(6차 사용성 S) — revenue의 SortHead 공유 (§8.1 primitives first) */}
          <SortHead k="name" sort={sort} onToggle={cycleSort}>고객 · 담당자</SortHead>
          <SortHead k="stage" sort={sort} onToggle={cycleSort}>단계</SortHead>
          <SortHead k="health" sort={sort} onToggle={cycleSort}>건강도</SortHead>
          <span>다음 액션</span>
          <SortHead k="value" sort={sort} onToggle={cycleSort} align="right">금액</SortHead>
        </div>

        {sorted.length === 0 && (
          <EmptyState
            icon="accounts"
            title={term ? "검색 결과가 없습니다" : "고객이 없습니다"}
            description={term ? "다른 검색어를 시도하거나 검색을 지우세요." : "첫 고객을 등록하면 여기에 나타납니다."}
            action={term
              ? <Button variant="outline" size="sm" onClick={() => setSearch("")}>검색 지우기</Button>
              : <Button variant="primary" size="sm" icon="plus" onClick={createCustomer}>고객 등록</Button>}
            style={{ minHeight: 180, padding: "28px 12px" }}
          />
        )}

        {sorted.map(r => (
          <div
            key={r.key}
            className="hub-row"
            role="button"
            tabIndex={0}
            data-customer-row={r.key}
            onClick={() => setOpenKey(r.key)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenKey(r.key); } }}
            style={{
              display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "11px 16px",
              borderBottom: "1px solid var(--line-soft)", alignItems: "center", cursor: "pointer",
              boxShadow: r.health === "risk" && !r.dormant ? "inset 1px 0 0 var(--danger-line)" : "none",
              // 휴면은 행 전체 opacity 금지(§5.3) — "기약 없음 (휴면)" 라벨 + 이름 luminance로 전달.
              outline: selection.selectedId === r.key ? "1px solid var(--moon-300)" : undefined,
              outlineOffset: -1,
            }}
          >
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={r.name} size={30} tone={r.type === "personal" ? "personal" : "company"} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.dormant ? "var(--fg-muted)" : undefined }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[r.person, r.sub].filter(Boolean).join(" · ") || "—"}
                  {r.kind === "lead" && r.deals?.length > 0 && (() => {
                    // 가장 진행된 딜의 단계를 간이 표기 (패배 딜은 제외)
                    const live = r.deals.filter(d => d.stage !== "lost");
                    if (!live.length) return ` · 딜 ${r.deals.length} (패배)`;
                    const top = live.reduce((a, b) =>
                      DEAL_STAGES.findIndex(s => s.key === b.stage) > DEAL_STAGES.findIndex(s => s.key === a.stage) ? b : a);
                    const label = DEAL_STAGES.find(s => s.key === top.stage)?.label || top.stage;
                    return ` · 딜 ${live.length} · ${label}`;
                  })()}
                  {r.dormant && " · 기약 없음"}
                </div>
              </div>
            </div>
            <Badge tone="neutral" size="xs" variant="outline">{r.stage}</Badge>
            <div>
              {r.health ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="num" style={{ fontSize: 12, fontWeight: 500, color: HEALTH_TONE[r.health] === 'danger' ? 'var(--danger)' : 'var(--fg-muted)' }}>
                    {r.healthScore != null ? r.healthScore : { ok: "안전", warning: "주의", risk: "위험" }[r.health]}
                  </span>
                </span>
              ) : <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>—</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.dormant ? "기약 없음 (휴면)" : (r.nextAction || "—")}
            </div>
            <div className="num" style={{ fontSize: 12.5, fontWeight: 500, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(r.valueNum)}
            </div>
          </div>
        ))}
      </Card>

      {openRow && <Customer360Drawer row={openRow} onClose={() => setOpenKey(null)} onNavigate={onNavigate} />}
    </div>
  );
}
