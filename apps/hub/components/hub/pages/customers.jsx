"use client";

// 고객 DB — Leads·Accounts 통합 뷰 (2026-07-16 CRM 와이어프레임 '고객 DB' 화면).
// 한 테이블에서 리드(영업 진행)와 계정(계약 고객)을 함께 보고, 행 클릭으로 Contact 중심
// Customer 360 드로어를 연다. 세그먼트는 기록 데이터에서 계산한다 — 근거 없는 세그먼트
// (재계약 임박 등 소스가 없는 것)는 만들지 않는다.

import React from "react";
import { OfficeWorkflowPanel } from '../office-workflow-panel';
import { RelatedMemos } from '../related-memos';
import { RelatedCustomerProjects } from '../related-customer-projects';
import { ContextMemoDrawer } from '../context-memo-drawer';
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import {
  Badge, Card, Button, IconButton, Avatar, Input, EmptyState, SyncBadge, Kbd, Drawer,
  SegmentedControl, CheckboxRow, TextField, TextAreaField, SelectField, Skeleton,
  CertaintyBadge, ChipToggle,
} from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import { ContactRecordForm } from "../contact-record-form";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { useRevenueLedger, saveRevenueRecord, LeadEnrichmentPanel, SortHead } from "./revenue";
import { requestPersonaChat } from "../persona-client";
import { FloatingMentorWidget } from "../floating-mentor-widget";
import { DEAL_STAGES, STAGE_FILL } from "@/lib/deal-stages";
import { UNREFERENCED_GUARD, describeReferences } from "@/lib/sales-os/customer-delete-contract";
import { LEAD_SUBJECTS, subjectLabels } from "@/lib/sales-os/lead-labels";
import { CUSTOMER_LABEL_MISSING, customerGenreOptions, customerRegionOptions, matchesCustomerLabels, normalizeGenreLabels } from "@/lib/sales-os/customer-labels";
import { REACTION_LABEL } from "@/lib/sales-os/followup-scoring";
import './customer-focus.css';

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

// health는 점수 밴드 — 신호등 금지(§5.2). 점수 미달은 '확인 필요'(neutral)이며, 실제 사건/지연만 danger(DESIGN.md §5.3).
const HEALTH_TONE = { ok: "neutral", warning: "neutral", risk: "neutral" };
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
      sub: [l.region, subjectLabels(l.subjects).slice(0, 2).join("·"), l.genres?.[0] ? `#${l.genres[0]}` : null, l.source !== "—" ? l.source : null].filter(Boolean).join(" · "),
      region: l.region || "",
      subjects: Array.isArray(l.subjects) ? l.subjects : [],
      genres: Array.isArray(l.genres) ? l.genres : [],
      labelSource: l.labelSource || {},
      stage: l.stage,
      stageOrder: LEAD_STAGE_ORDER[l.stage] ?? 0,
      health: scoreBand(l.score),
      healthScore: Number.isFinite(l.score) ? l.score : null,
      nextAction: l.nextAction || "",
      nextActionAt: l.nextActionAt || null,
      last: l.last || "—",
      lastContactAt: l.lastContactAt || null,
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
      sub: [a.region, subjectLabels(a.subjects).slice(0, 2).join("·"), a.genres?.[0] ? `#${a.genres[0]}` : null, `계약 고객 · 딜 ${a.deals}건`].filter(Boolean).join(" · "),
      region: a.region || "",
      subjects: Array.isArray(a.subjects) ? a.subjects : [],
      genres: Array.isArray(a.genres) ? a.genres : [],
      labelSource: a.labelSource || {},
      stage: "고객",
      stageOrder: 90,
      health: a.health,
      healthScore: null,
      nextAction: a.nextAction || "",
      nextActionAt: a.nextActionAt || null,
      last: a.last || "—",
      lastContactAt: a.lastContactAt || null,
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
  { key: "important", label: "⭐ 중요 고객" },
  { key: "risk", label: "확인 필요" },
  { key: "new", label: "신규" },
  { key: "dormant", label: "기약 없음" },
  { key: "customer", label: "계약 고객" },
];

function segmentFilter(row, seg) {
  if (seg === "important") return row.focusOverride === "raise";
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
// crm_activities.reaction 어휘(0016 CHECK)의 라벨은 followup-scoring이 정본(파일 상단 import).
// 컨택 시트가 필수로 받는 반응이 타임라인에 되돌아온다(0a).

function ActivityTimeline({ rows, onDeleteActivity }) {
  if (!rows.length) {
    return <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "10px 0" }}>아직 기록이 없습니다. 아래에서 첫 기록을 남기세요.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((a, i) => (
        <div key={a.id || i} style={{
          display: "grid",
          gridTemplateColumns: onDeleteActivity && a.id && !String(a.id).startsWith("local-") ? "18px 1fr auto auto" : "18px 1fr auto",
          gap: 10,
          padding: "9px 0",
          borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "none",
          alignItems: "flex-start",
        }}>
          <span style={{ color: "var(--fg-muted)", marginTop: 1 }}>
            <Iconed name={ACT_ICON[a.type] || "edit"} size={13} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.msg}</div>
            <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span>{ACT_LABEL[a.type] || a.type}</span>
              {/* 반응은 중립 뱃지 — 우려·거절도 여기서는 사실 표시일 뿐, 위기 표현은 별도 채널(§5.3). */}
              {a.reaction && <Badge tone="neutral" size="xs" variant="outline">{REACTION_LABEL[a.reaction] || a.reaction}</Badge>}
            </div>
          </div>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>{a.at}</span>
          {onDeleteActivity && a.id && !String(a.id).startsWith("local-") && (
            <IconButton
              icon="x"
              size={20}
              iconSize={11}
              tooltip="기록 삭제 (되돌리기 지원)"
              aria-label="기록 삭제"
              onClick={() => onDeleteActivity(a)}
              style={{ opacity: 0.5, marginTop: -2 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// 빠른 기록은 메모 전용이다. 통화·카톡·미팅 같은 연락은 바로 위 공용 기록창(반응 필수 규칙·
// 후속 계획)으로만 받는다 — 여기서 연락 유형을 고르게 하면 그 규칙을 옆 입력창이 우회하고,
// 반응 없는 통화가 주간 연락 수·마지막 접점으로 잡힌다(2026-09-23 병합 검증).
function QuickLog({ onSave }) {
  const [text, setText] = React.useState("");
  const save = () => {
    const body = text.trim();
    if (!body) return;
    onSave({ type: "note", body });
    setText("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TextAreaField
        label="빠른 메모"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="연락이 아닌 메모를 남기면 타임라인에 쌓여요"
        rows={4}
      />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" onClick={save} disabled={!text.trim()}>기록 저장</Button>
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

// ── 고객 삭제 ───────────────────────────────────────────────────────────────
// "잘못 만든 고객"만 지운다는 확정 정책(2026-08-19). 이력이 붙어 있으면 삭제 대신
// 무엇이 붙어 있는지 보여주고 멈춘다 — FK가 전부 조용해서(set null / cascade) 그냥
// 지우면 딜·프로젝트는 주인 없이 남고 활동 기록은 함께 사라진다.
//
// 순서: [삭제] → 서버에 참조 선조회 → 깨끗하면 확인 스트립 → [삭제] 확정 → 부모가
// 행을 숨기고 3.5초 되돌리기 창을 연다. 선조회를 먼저 하는 이유는, 차단 사유를 지연
// POST의 응답으로만 알리면 "삭제됨"을 3.5초 보여준 뒤에야 못 지운다고 말하게 되기 때문.
function CustomerDeleteAction({ row, onConfirm }) {
  const [phase, setPhase] = React.useState("idle"); // idle | checking | confirm | blocked | error
  const [detail, setDetail] = React.useState("");
  // 라이브 스키마에 없어 조사하지 못한 링크 — 그 참조는 존재할 수 없으니 판정은 유효하지만,
  // "전부 확인했다"고 말하지는 않는다.
  const [skipped, setSkipped] = React.useState([]);

  const check = async () => {
    setPhase("checking");
    setDetail("");
    setSkipped([]);
    try {
      const qs = new URLSearchParams({
        kind: row.kind === "account" ? "account" : "lead",
        id: String(row.id || ""),
        ...(row.companyId ? { companyId: String(row.companyId) } : {}),
      });
      const resp = await fetch(`/api/hub/revenue/customer-references?${qs}`, { cache: "no-store" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.status === "error") {
        // 못 셌으면 삭제로 넘어가지 않는다 — "참조 0"으로 가정하는 순간 이력이 사라진다.
        setPhase("error");
        setDetail(data.status === "preview"
          ? "Supabase 미설정 — 무엇이 붙어 있는지 확인할 수 없어 삭제하지 않았습니다."
          : "붙어 있는 기록을 확인하지 못했습니다 — 삭제하지 않았습니다. 다시 시도하세요.");
        return;
      }
      setSkipped(Array.isArray(data.skipped) ? data.skipped : []);
      if (!data.deletable) {
        setPhase("blocked");
        setDetail(describeReferences(data.references || {}));
        return;
      }
      setPhase("confirm");
    } catch {
      setPhase("error");
      setDetail("네트워크 오류로 확인하지 못했습니다 — 삭제하지 않았습니다.");
    }
  };

  if (phase === "blocked") {
    return (
      <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, color: "var(--fg-muted)" }}>
          <span style={{ color: "var(--danger)" }}>{detail}이 붙어 있어 삭제할 수 없습니다.</span>
          <br />기록이 주인을 잃습니다. 잘못 만든 고객만 삭제할 수 있습니다.
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>닫기</Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, color: "var(--danger)" }}>{detail}</span>
        <Button variant="ghost" size="sm" onClick={check}>다시 확인</Button>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.5, color: "var(--fg-muted)" }}>
          붙어 있는 기록이 없습니다. 삭제할까요? (삭제 후 3.5초간 되돌릴 수 있습니다)
          {skipped.length > 0 && (
            <>
              <br />
              <span style={{ color: "var(--fg-faint)" }}>
                {skipped.join(", ")}는 이 DB에 없어 확인하지 못했습니다.
              </span>
            </>
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>취소</Button>
        <Button variant="danger" size="sm" onClick={() => onConfirm(row)}>삭제 (되돌리기 지원)</Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={check}
      disabled={phase === "checking" || !row.id}
      style={{ color: "var(--danger)" }}
    >
      {phase === "checking" ? "확인 중…" : "삭제"}
    </Button>
  );
}

function CustomerOutreachDrafter({ row }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [draftText, setDraftText] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setOpen(true);
    try {
      const res = await requestPersonaChat({
        personaId: "sales",
        mode: "outreach-draft",
        draft: `[고객 360 연락 맥락]\n고객명: ${row.person || row.name}\n조직/소속: ${row.name || "미지정"}${row.personTitle ? ` (${row.personTitle})` : ""}\n유형: ${row.kind === "account" ? "계약 고객" : `리드 (${row.stage})`}\n건강도/상태: ${row.health || "보통"}\n기존 다음 액션: ${row.nextAction || "없음"}\n\n위 고객에게 발송할 3~4문장의 부담 없는 카카오톡/문자 연락 초안을 작성해줘.`,
      });
      setLoading(false);
      if (res.state === "done") {
        setDraftText(res.text);
      }
    } catch (e) {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!draftText) return;
    navigator.clipboard.writeText(draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Iconed name="sparkle" size={13} style={{ color: "var(--moon-300)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>맞춤 연락 초안 (Guru)</span>
        </div>
        {!open ? (
          <Button variant="outline" size="xs" icon="sparkle" onClick={handleGenerate}>
            {loading ? "작성 중…" : "초안 생성"}
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "var(--fg-faint)", cursor: "pointer", fontSize: 10 }}
          >
            접기
          </button>
        )}
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {loading ? (
            <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>고객 맥락에 맞는 초안을 작성하고 있습니다…</div>
          ) : draftText ? (
            <>
              <div
                style={{
                  background: "var(--surface-3)",
                  padding: "8px 10px",
                  borderRadius: "var(--r-xs)",
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  color: "var(--fg)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                {draftText}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <Button variant="ghost" size="xs" icon={copied ? "check" : "copy"} onClick={handleCopy}>
                  {copied ? "복사됨 ✓" : "본문 복사"}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CustomerLabelsEditor({ row, onSaved }) {
  const draftTouched = React.useRef(false);
  const [region, setRegion] = React.useState(row.region || "");
  const [subjects, setSubjects] = React.useState(row.subjects || []);
  const [genresText, setGenresText] = React.useState((row.genres || []).join(", "));
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (saving || draftTouched.current) return;
    setRegion(row.region || "");
    setSubjects(row.subjects || []);
    setGenresText((row.genres || []).join(", "));
  }, [row.key, row.region, row.subjects, row.genres, saving]);

  const rawGenres = genresText.split(/[,，\n]/).map((part) => part.trim()).filter(Boolean);
  const genres = normalizeGenreLabels(rawGenres);
  const regionChanged = region.trim() !== (row.region || "");
  const subjectsChanged = JSON.stringify(subjects) !== JSON.stringify(row.subjects || []);
  const genresChanged = JSON.stringify(genres) !== JSON.stringify(row.genres || []);
  const changed = regionChanged || subjectsChanged || genresChanged;

  const save = async () => {
    if (!row.id || !changed || saving) return;
    if (rawGenres.length > 12 || rawGenres.some((label) => label.length > 40)) {
      setMessage("장르는 최대 12개, 각 40자까지 입력할 수 있습니다.");
      return;
    }
    setSaving(true);
    setMessage("");
    const patch = { id: row.id };
    if (regionChanged) patch.region = region.trim();
    if (subjectsChanged) patch.subjects = subjects;
    if (genresChanged) patch.genres = genres;
    if (regionChanged || subjectsChanged) patch.labelSource = {
      ...(row.labelSource || {}),
      ...(regionChanged ? { region: "operator" } : {}),
      ...(subjectsChanged ? { subjects: "operator" } : {}),
    };
    try {
      const result = await saveRevenueRecord(row.kind, "update", patch);
      if (!result?.ok) {
        setMessage(result?.status === "preview" ? "저장소가 연결되지 않아 라벨을 저장하지 못했습니다." : "라벨을 저장하지 못했습니다. 입력은 남아 있습니다.");
        return;
      }
      draftTouched.current = false;
      setGenresText(genres.join(", "));
      setMessage("라벨을 저장했습니다.");
      onSaved?.();
    } catch {
      setMessage("라벨을 저장하지 못했습니다. 입력은 남아 있습니다.");
    } finally {
      setSaving(false);
    }
  };

  const visible = [row.region, ...subjectLabels(row.subjects), ...(row.genres || [])].filter(Boolean);
  return (
    <section className="customer-labels" aria-label="고객 라벨">
      <h3>고객 라벨</h3>
      {visible.length ? (
        <div className="customer-labels__values">
          {row.region && <span>{row.region}{row.labelSource?.region === "derived" ? " · 권장" : ""}</span>}
          {subjectLabels(row.subjects).map((label) => <span key={`subject:${label}`}>{label}</span>)}
          {(row.genres || []).map((label) => <span key={`genre:${label}`}>#{label}</span>)}
        </div>
      ) : <p className="customer-labels__empty">지역·과목·장르가 아직 없습니다.</p>}
      <details>
        <summary>라벨 수정</summary>
        <div className="customer-labels__fields">
          <TextField label="지역" placeholder="경기-안양" value={region} onChange={(event) => { draftTouched.current = true; setRegion(event.target.value); setMessage(""); }} />
          <div role="group" aria-label="과목" className="customer-labels__subjects">
            <span className="customer-labels__field-label">과목</span>
            <div>{LEAD_SUBJECTS.map((subject) => (
              <ChipToggle key={subject.key} label={subject.label} selected={subjects.includes(subject.key)} onChange={() => {
                draftTouched.current = true;
                setSubjects((current) => current.includes(subject.key)
                  ? current.filter((key) => key !== subject.key)
                  : LEAD_SUBJECTS.filter((item) => item.key === subject.key || current.includes(item.key)).map((item) => item.key));
                setMessage("");
              }} />
            ))}</div>
          </div>
          <TextField label="장르" hint="쉼표로 구분 · 최대 12개" placeholder="음악, 디자인" value={genresText} onChange={(event) => { draftTouched.current = true; setGenresText(event.target.value); setMessage(""); }} />
          {row.labelSource?.subjects === "derived" && <CertaintyBadge state="recommended" label="과목은 기존 기록에서 권장된 값입니다" />}
          {message && <p role={message.includes("저장했습니다") ? "status" : "alert"} className="customer-labels__message">{message}</p>}
          <div className="customer-labels__actions">
            <Button variant="primary" size="sm" disabled={!row.id || !changed || saving} onClick={save}>{saving ? "저장 중…" : "라벨 저장"}</Button>
          </div>
        </div>
      </details>
    </section>
  );
}

function Customer360Drawer({ row, onClose, onNavigate, onDelete, onFocusChange, onLabelsSaved }) {
  const [memoState, setMemoState] = React.useState(null);
  const memoContexts = React.useMemo(() => [{ type: row.kind, id: row.id, label: row.person || row.name }], [row.kind, row.id, row.person, row.name]);
  const [activities, setActivities] = React.useState([]);
  const [actSync, setActSync] = React.useState("loading");
  // 컨택 완료 시트 저장 직후 부모 기록 재조회 없이 최신 다음 액션을 반영
  const [nextActionOverride, setNextActionOverride] = React.useState(null);
  const [focusOverride, setFocusOverride] = React.useState(row.focusOverride || "default");
  React.useEffect(() => { setFocusOverride(row.focusOverride || "default"); }, [row.focusOverride]);

  const { schedule: scheduleActUndo, cancel: cancelActUndo } = useUndoableAction();
  const [actNotice, setActNotice] = React.useState(null);
  const [guruOpen, setGuruOpen] = React.useState(false);

  const deleteActivity = React.useCallback((activity) => {
    const match = a => (activity.id ? a.id === activity.id : a === activity);
    const removed = activities.filter(match);
    setActivities(prev => prev.filter(a => !match(a)));
    if (!activity.id || String(activity.id).startsWith("local-")) return;
    const key = `cust-act-delete-${activity.id}`;
    const restore = () => setActivities(prev => [...removed, ...prev.filter(a => !match(a))]);
    scheduleActUndo(key, () => {
      setActNotice(cur => (cur?.key === key ? null : cur));
      saveRevenueRecord("activity", "delete", { id: activity.id }).then(r => {
        if (r.ok) return;
        restore();
        setActError({ body: "", message: `기록 삭제 실패 (${r.status}) — 행을 복원했습니다.` });
      });
    });
    setActNotice({
      key,
      label: "기록 삭제됨",
      undo: () => {
        if (cancelActUndo(key)) restore();
        setActNotice(null);
      },
    });
  }, [activities, scheduleActUndo, cancelActUndo]);

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
        if (d?.status === "error") {
          setActSync("error");
          return;
        }
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

  if (memoState) return <ContextMemoDrawer contexts={memoContexts} noteId={memoState.noteId || null} onClose={() => setMemoState(null)} />;

  return (
    <Drawer
      title={row.person || row.name}
      subtitle={row.person ? `${row.name}${row.personTitle ? ` · ${row.personTitle}` : ""}` : (row.sub || null)}
      onClose={onClose}
      width="min(440px, 96vw)"
      footer={(
        <div className="customer-focus-footer">
          <Button variant="primary" onClick={() => setMemoState({})}>메모 남기기</Button>
          {editHref && <Button variant="outline" size="sm" onClick={() => onNavigate?.(editHref)}>정식 편집 열기</Button>}
          <div style={{ flex: 1 }} />
          <CustomerDeleteAction row={row} onConfirm={onDelete} />
        </div>
      )}
    >
      <div className="customer-focus">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="outline"
            active={focusOverride === "raise"}
            aria-pressed={focusOverride === "raise"}
            size="xs"
            icon="star"
            onClick={() => {
              const next = focusOverride === "raise" ? "default" : "raise";
              const prev = focusOverride;
              setFocusOverride(next);
              onFocusChange?.(row.key, next);
              if (!row.id) return;
              saveRevenueRecord(row.kind === "account" ? "account" : "lead", "update", {
                id: row.id,
                focusOverride: next,
              }).then(r => {
                if (!r?.ok) {
                  setFocusOverride(prev);
                  onFocusChange?.(row.key, prev);
                }
              });
            }}
          >
            {focusOverride === "raise" ? "⭐ 중요 고객" : "중요 고객 지정"}
          </Button>
          <Button
            variant="outline"
            size="xs"
            icon="sparkle"
            onClick={() => setGuruOpen(true)}
          >
            Guru 전략 코칭 (⌘J)
          </Button>
        </div>
        {/* 다음 액션 */}
        {(nextActionOverride ?? row.nextAction) && (
          <section className="customer-focus-next" aria-label="다음 행동">
            <h3>다음 행동</h3>
            <p>{nextActionOverride ?? row.nextAction}</p>
          </section>
        )}

        <CustomerLabelsEditor row={row} onSaved={onLabelsSaved} />


        {/* 활동 타임라인 (읽기 우선 배치) */}
        <section className="customer-focus-activity" aria-label="활동 타임라인">
          <div className="customer-focus-section-heading">
            <h3>활동 타임라인</h3>
            <SyncBadge state={actSync} />
          </div>
          {actNotice && (
            <div
              role="status"
              aria-live="polite"
              className="fade-up"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: "var(--surface-3)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                fontSize: 11.5,
                color: "var(--fg)",
                marginBottom: 8,
              }}
            >
              <span>{actNotice.label}</span>
              {actNotice.undo && (
                <Button variant="ghost" size="xs" onClick={actNotice.undo}>
                  되돌리기
                </Button>
              )}
            </div>
          )}
          {actSync === "loading" ? (
            <div style={{ padding: "8px 0" }}>
              <Skeleton height={14} lines={2} />
            </div>
          ) : actSync === "error" ? (
            <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
              활동 기록을 읽지 못했습니다.
              <Button variant="ghost" size="xs" onClick={reload}>다시 시도</Button>
            </div>
          ) : (
            <><ActivityTimeline rows={activities.slice(0, 3)} onDeleteActivity={deleteActivity} />{activities.length > 3 && <details><summary style={{ minHeight: 44, cursor: "pointer", color: "var(--fg-muted)", fontSize: 12 }}>전체 대화 기록 보기</summary><ActivityTimeline rows={activities.slice(3)} onDeleteActivity={deleteActivity} /></details>}</>
          )}
        </section>

        <RelatedCustomerProjects type={row.kind} id={row.id} />
        <RelatedMemos type={row.kind} id={row.id} onOpen={(noteId) => setMemoState({ noteId })} />

        <details><summary style={{ minHeight: 44, cursor: "pointer", color: "var(--fg-muted)", fontSize: 12 }}>연락처·거래 정보</summary>
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

        {/* 포커스 오버라이드 — 숫자 편집 없이 3단 조정만 (spec §7 확정 규칙) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>포커스</span>
          <SegmentedControl
            label="포커스 조정"
            options={[
              { key: "lower", label: "내리기" },
              { key: "default", label: "기본" },
              { key: "raise", label: "올리기 (중요)" },
            ]}
            value={focusOverride}
            onChange={(next) => {
              const prevValue = focusOverride;
              setFocusOverride(next);
              onFocusChange?.(row.key, next);
              if (!row.id) return;
              saveRevenueRecord(row.kind === "account" ? "account" : "lead", "update", {
                id: row.id,
                focusOverride: next,
              }).then(r => {
                // 실패하면 토글을 원위치 — 저장 안 된 값이 계속 선택돼 보이면 안 된다.
                if (!r?.ok) {
                  setFocusOverride(prevValue);
                  onFocusChange?.(row.key, prevValue);
                }
              });
            }}
          />
        </div>

        {/* 딜 파이프라인 — 이 고객에 걸린 딜의 단계·금액·마감 간이 계기 */}
        <DealPipelineSection deals={row.deals || []} />

        {/* 스코어 요약 — 리드 enrichment 분류·증거 (점수 산출 근거의 간이 표기) */}
        {row.raw && <LeadEnrichmentPanel lead={row.raw} />}

        </details>

        <OfficeWorkflowPanel
          key={row.key}
          intent="customer_reply"
          scope={row.workspace === 'classin' || row.type === 'company' ? 'classin' : row.workspace === 'brand' || row.type === 'personal' ? 'personal' : null}
          originRef={{ entityType: row.kind === 'account' ? 'customer_account' : 'lead', entityId: row.id }}
          title="답장 초안"
          onNavigate={onNavigate}
        />
        <details><summary style={{ minHeight: 44, cursor: "pointer", color: "var(--fg-muted)", fontSize: 12 }}>기존 영업 코칭</summary>
          <CustomerOutreachDrafter row={row} />
        </details>
        <details><summary style={{ minHeight: 44, cursor: "pointer", color: "var(--fg-muted)", fontSize: 12 }}>연락 결과 남기기</summary>

        {/* 컨택 완료 시트 — Phase 1C 핵심 루프 */}
        {/* 상세 안에서는 드로어를 겹치지 않고 폼만 인라인으로 쓴다(CRM 지침 §6.2 —
            활성 오버레이는 언제나 하나). 껍데기가 필요한 진입점은 ContactRecordDrawer. */}
        <ContactRecordForm
          target={{ kind: row.kind === "account" ? "account" : "lead", id: row.id, companyId: row.companyId, name: row.person || row.name }}
          aiContext={`${row.name || "미지정"} · ${row.kind === "account" ? "계약 고객" : `리드 (${row.stage || "진행중"})`}`}
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
          onSummaryPersisted={({ activityId, optimisticId }) => {
            if (!activityId) { reload(); return; }
            setActivities(prev => prev.map(a => (
              a.id === optimisticId ? { ...a, id: activityId } : a
            )));
          }}
        />

        {/* 빠른 기록 */}
        {actError && (
          <div role="alert" style={{ fontSize: 11.5, color: "var(--danger)", lineHeight: 1.5 }}>
            {actError.message}
            {actError.body && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--fg-muted)" }}>미저장 입력: “{actError.body}”</span>
                <Button variant="ghost" size="xs" onClick={() => logActivity({ type: "note", body: actError.body })}>
                  재시도
                </Button>
              </div>
            )}
          </div>
        )}
        <QuickLog onSave={logActivity} />
        </details>
      </div>

      {guruOpen && (
        <FloatingMentorWidget
          isOpen={guruOpen}
          onClose={() => setGuruOpen(false)}
          agent="guru"
          contextType="customer"
          contextTitle={row.person || row.name || "고객 전략 코칭"}
          contextData={{
            id: row.id,
            name: row.person || row.name,
            company: row.name,
            stage: row.stage || (row.kind === "account" ? "계약 고객" : "리드"),
            health: row.health,
            nextAction: nextActionOverride ?? row.nextAction,
            notes: row.notes || row.sub,
          }}
          onApplyText={(text) => {
            const trimmed = text.slice(0, 100);
            setNextActionOverride(trimmed);
            if (row.id) {
              saveRevenueRecord(row.kind === "account" ? "account" : "lead", "update", {
                id: row.id,
                nextAction: trimmed,
              });
            }
          }}
        />
      )}
    </Drawer>
  );
}

// ── 새 고객 등록 드로어 (No ghost records) ──────────────────────────────────
// 저장 버튼을 누를 때만 영속 DB에 생성하고, 취소 시 빈 고객 레코드를 남기지 않는다.
function NewCustomerDrawer({ open, onClose, onCreated }) {
  const [name, setName] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [stage, setStage] = React.useState("New");
  const [nextAction, setNextAction] = React.useState("");
  const [isImportant, setIsImportant] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  if (!open) return null;

  const reset = () => {
    setName("");
    setPerson("");
    setPhone("");
    setStage("New");
    setNextAction("");
    setIsImportant(false);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("고객 또는 학원명을 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await saveRevenueRecord("lead", "create", {
        name: trimmedName,
        contactName: person.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        stage,
        nextAction: nextAction.trim() || undefined,
        focusOverride: isImportant ? "raise" : "default",
      });
      setSubmitting(false);
      if (res.ok && res.id) {
        onCreated(res.id);
        handleClose();
      } else {
        setError(`고객 생성 실패 (${res.status || "오류"}) — 다시 시도하세요.`);
      }
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Drawer
      title="새 고객 등록"
      subtitle="기본 정보를 입력하고 등록하면 고객 기록에 추가됩니다"
      onClose={handleClose}
      width="min(440px, 96vw)"
      footer={(
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>취소</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={submitting || !name.trim()}>
            {submitting ? "등록 중…" : "등록 저장"}
          </Button>
        </div>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <TextField
          label="고객 / 학원명"
          required
          value={name}
          onChange={e => { setName(e.target.value); setError(""); }}
          placeholder="예: 미래탐구 대치점"
          autoFocus
        />
        <TextField
          label="담당자 성함"
          value={person}
          onChange={e => setPerson(e.target.value)}
          placeholder="예: 김원장"
        />
        <TextField
          label="연락처 / 전화번호"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="010-0000-0000"
        />
        <SelectField
          label="초기 단계"
          value={stage}
          onChange={e => setStage(e.target.value)}
          options={[
            { value: "New", label: "신규 (New)" },
            { value: "Contact", label: "접촉 (Contact)" },
            { value: "Qualified", label: "검증 (Qualified)" },
          ]}
        />
        <TextField
          label="다음 행동"
          value={nextAction}
          onChange={e => setNextAction(e.target.value)}
          placeholder="예: 소개서 발송 및 첫 상담"
        />
        <CheckboxRow
          checked={isImportant}
          onChange={setIsImportant}
          text="⭐ 중요 고객으로 등록 (집중도 높임)"
        />
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
      </div>
    </Drawer>
  );
}

// ── 페이지 ──────────────────────────────────────────────────────────────────

export function Customers({ onNavigate }) {
  const { ledger, syncState, reload: reloadLedger } = useRevenueLedger();
  const [segment, setSegment] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [regionFilter, setRegionFilter] = React.useState("");
  const [subjectFilter, setSubjectFilter] = React.useState("");
  const [genreFilter, setGenreFilter] = React.useState("");
  const [sort, setSort] = React.useState({ key: null, dir: "asc" });
  const [openKey, setOpenKey] = React.useState(null);
  const [createError, setCreateError] = React.useState(null);
  const [focusOverrides, setFocusOverrides] = React.useState({});
  // 삭제는 3.5초 뒤에야 POST된다 — 그동안 행은 목록에서 빠져 있고, 되돌리면 그대로 돌아온다.
  const [deletedKeys, setDeletedKeys] = React.useState(() => new Set());
  const [deleteNotice, setDeleteNotice] = React.useState(null);
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  const ledgerRows = React.useMemo(() => toRows(ledger), [ledger]);
  // 낙관 삭제된 행은 기록이 다시 로드돼도 계속 숨긴다 — 되돌리기 창이 닫히기 전에
  // 재조회가 끼어들면 지운 행이 깜빡이며 되살아난다.
  const allRows = React.useMemo(
    () => ledgerRows
      .filter(r => !deletedKeys.has(r.key))
      .map(r => ({
        ...r,
        focusOverride: focusOverrides[r.key] ?? r.focusOverride,
      })),
    [ledgerRows, deletedKeys, focusOverrides],
  );

  const toggleImportant = React.useCallback((e, row) => {
    e.stopPropagation();
    const current = focusOverrides[row.key] ?? row.focusOverride;
    const next = current === "raise" ? "default" : "raise";
    setFocusOverrides(prev => ({ ...prev, [row.key]: next }));
    if (!row.id) return;
    saveRevenueRecord(row.kind === "account" ? "account" : "lead", "update", {
      id: row.id,
      focusOverride: next,
    }).then(r => {
      if (!r?.ok) {
        setFocusOverrides(prev => ({ ...prev, [row.key]: current }));
      }
    });
  }, [focusOverrides]);

  const restoreRow = React.useCallback((key) => {
    setDeletedKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
  }, []);

  // 확인까지 끝난 삭제 — 드로어를 닫고 행을 감춘 뒤 되돌리기 창을 연다. 창이 닫히면
  // 그때 POST하고, 실패하면 행을 되살리고 원인을 이름으로 말한다(무언 소실 금지).
  const deleteCustomer = React.useCallback((row) => {
    const { key, name } = row;
    setOpenKey(null);
    setDeletedKeys(prev => new Set(prev).add(key));
    const undoKey = `delete-customer-${key}`;
    setDeleteNotice({
      key: undoKey,
      tone: "ok",
      label: `${name} 삭제됨`,
      undo: () => {
        if (cancelUndoable(undoKey)) restoreRow(key);
        setDeleteNotice(null);
      },
    });
    scheduleUndoable(undoKey, () => {
      setDeleteNotice(cur => (cur?.key === undoKey ? null : cur)); // 창 종료 시 소거
      saveRevenueRecord(row.kind === "account" ? "account" : "lead", "delete", {
        id: row.id,
        companyId: row.companyId || null,
        // 서버 가드 — 선조회 이후 이력이 생겼더라도 여기서 다시 막힌다.
        guard: UNREFERENCED_GUARD,
      }).then(r => {
        if (r.ok) return;
        restoreRow(key);
        const refs = r.data?.status === "blocked" ? describeReferences(r.data.references || {}) : "";
        setDeleteNotice({
          key: `${undoKey}-fail`,
          tone: "err",
          label: refs
            ? `${refs}이 생겨 삭제되지 않았습니다 — ${name}을(를) 되살렸습니다.`
            : r.status === "preview"
              ? `Supabase 미설정 — 삭제가 저장되지 않아 ${name}을(를) 되살렸습니다.`
              : `삭제 실패 (${r.status}) — ${name}을(를) 되살렸습니다.`,
          undo: null,
        });
      });
    });
  }, [scheduleUndoable, cancelUndoable, restoreRow]);

  // 딥링크: ?customer=<kind>:<id> — 기록 로드 후 1회만 열고 쿼리 소거 (DESIGN §8.1)
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const deepLinkDone = React.useRef(false);
  React.useEffect(() => {
    // 기록이 아직 로드 전(loading)일 때만 대기 — 빈/preview DB에서도 파라미터를 소비하고
    // 설명한다(기존: 빈 기록이면 ?customer= 링크가 영원히 무시·무설명, 4차 재감사 S).
    if (deepLinkDone.current || syncState === 'loading') return;
    const target = searchParams?.get("customer");
    if (!target) { deepLinkDone.current = true; return; }
    deepLinkDone.current = true;
    if (allRows.some(r => r.key === target)) setOpenKey(target);
    else setCreateError('링크의 고객을 찾을 수 없습니다 — 기록이 비어 있거나 항목이 삭제됐습니다.');
    router.replace(pathname, { scroll: false });
  }, [allRows, searchParams, router, pathname, syncState]);

  const regionOptions = React.useMemo(() => customerRegionOptions(allRows), [allRows]);
  const genreOptions = React.useMemo(() => customerGenreOptions(allRows), [allRows]);
  const labelFiltersActive = Boolean(regionFilter || subjectFilter || genreFilter);
  const term = search.trim().toLocaleLowerCase("ko");
  const filtered = allRows.filter(r =>
    segmentFilter(r, segment) &&
    matchesCustomerLabels(r, { region: regionFilter, subject: subjectFilter, genre: genreFilter }) &&
    (!term || [r.name, r.person, r.sub, ...subjectLabels(r.subjects), ...(r.genres || [])]
      .filter(Boolean).join(" ").toLocaleLowerCase("ko").includes(term))
  );

  // 정렬: 헤더 클릭 asc → desc → 해제 3단 (DESIGN §8.1). 해제 시 기록 순서.
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
    const val = r => {
      if (sort.key === "value") return r.valueNum;
      if (sort.key === "stage") return r.stageOrder;
      if (sort.key === "last") return r.lastContactAt ? new Date(r.lastContactAt).getTime() : 0;
      return r.name;
    };
    return [...filtered].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (typeof av === "string") return av.localeCompare(bv, "ko") * dir;
      return (av - bv) * dir;
    });
  }, [filtered, sort]);

  const [newCustomerOpen, setNewCustomerOpen] = React.useState(false);

  // 키보드 계층(2026-08-05 배선): j/k 행 이동 · e 열기 · n 생성 · / 검색 · Esc 해제.
  const searchRef = React.useRef(null);
  const kbRows = React.useMemo(() => sorted.map(r => ({ id: r.key })), [sorted]);
  const selection = useCrmSelection(kbRows);
  useCrmKeyboard({
    selection,
    onNew: () => setNewCustomerOpen(true),
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

  // 4대 열 묶음: 고객·소속 / 최근 접점 / 다음 행동·일정 / 진행 상황 (2026-09-21 spec §3.1)
  const gridCols = "minmax(0,2.1fr) 1.1fr minmax(0,2.2fr) 1.1fr";

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
        <Input ref={searchRef} className="hub-toolbar" placeholder="학원명·담당자·지역 검색…" icon="search" clearable kbd="/" value={search} onChange={setSearch} />
        <Button variant="primary" size="sm" icon="plus" onClick={() => setNewCustomerOpen(true)}>고객 등록 <Kbd>N</Kbd></Button>
      </div>

      <SegmentedControl
        label="고객 세그먼트"
        options={SEGMENTS.map(s => ({ key: s.key, label: s.label, count: counts[s.key] }))}
        value={segment}
        onChange={setSegment}
      />

      <div className="customer-label-filters" role="group" aria-label="고객 지역·과목·장르 필터">
        <SelectField label="지역" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} options={regionOptions} />
        <SelectField label="과목" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} options={[
          { value: "", label: "전체 과목" },
          { value: CUSTOMER_LABEL_MISSING, label: "과목 미입력" },
          ...LEAD_SUBJECTS.map((subject) => ({ value: subject.key, label: subject.label })),
        ]} />
        <SelectField label="장르" value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)} options={genreOptions} />
        {labelFiltersActive && <Button variant="ghost" size="xs" onClick={() => { setRegionFilter(""); setSubjectFilter(""); setGenreFilter(""); }}>라벨 필터 해제</Button>}
        <span className="num customer-label-filters__count" role="status">{sorted.length}건</span>
      </div>

      <Card pad={false} style={{ overflow: "hidden" }}>
        <div className="hub-customers-grid" style={{
          display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "9px 16px",
          background: "var(--surface-2)", borderBottom: "1px solid var(--line)",
          fontSize: 10.5, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--fg-faint)",
        }}>
          {/* 4대 묶음 헤더 (2026-09-21 spec §3.1) */}
          <SortHead k="name" sort={sort} onToggle={cycleSort}>고객 · 소속</SortHead>
          <SortHead k="last" sort={sort} onToggle={cycleSort} className="hub-lc-m">최근 접점</SortHead>
          <span className="hub-lc-m">다음 행동 · 일정</span>
          <SortHead k="stage" sort={sort} onToggle={cycleSort} align="right">진행 상황</SortHead>
        </div>

        {syncState === "loading" ? (
          <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <Skeleton height={24} />
            <Skeleton height={24} />
            <Skeleton height={24} />
            <Skeleton height={24} />
          </div>
        ) : syncState === "error" ? (
          <EmptyState icon="accounts" title="고객을 불러오지 못했습니다" description="연결 상태를 확인한 뒤 다시 시도하세요." action={<Button variant="outline" size="sm" onClick={reloadLedger}>다시 시도</Button>} style={{ minHeight: 180, padding: "28px 12px" }} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="accounts"
            title={term || labelFiltersActive || segment !== "all" ? "조건에 맞는 고객이 없습니다" : "고객이 없습니다"}
            description={term || labelFiltersActive || segment !== "all" ? "검색어나 라벨 조건을 바꿔보세요." : "첫 고객을 등록하면 여기에 나타납니다."}
            action={term || labelFiltersActive || segment !== "all"
              ? <Button variant="outline" size="sm" onClick={() => { setSearch(""); setRegionFilter(""); setSubjectFilter(""); setGenreFilter(""); setSegment("all"); }}>조건 지우기</Button>
              : <Button variant="primary" size="sm" icon="plus" onClick={() => setNewCustomerOpen(true)}>고객 등록</Button>}
            style={{ minHeight: 180, padding: "28px 12px" }}
          />
        ) : (
          sorted.map(r => (
            <div
              key={r.key}
              className="hub-row hub-customers-grid"
              role="button"
              tabIndex={0}
              data-customer-row={r.key}
              onClick={() => setOpenKey(r.key)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenKey(r.key); } }}
              style={{
                display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "11px 16px",
                borderBottom: "1px solid var(--line-soft)", alignItems: "center", cursor: "pointer",
                outline: selection.selectedId === r.key ? "1px solid var(--moon-300)" : undefined,
                outlineOffset: -1,
                boxShadow: r.focusOverride === "raise" ? "inset 1px 0 0 var(--moon-300)" : undefined,
              }}
            >
              {/* 1. 고객 · 소속 */}
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <IconButton
                  icon="star"
                  size={22}
                  iconSize={13}
                  className={r.focusOverride === "raise" ? "hub-iconbtn--star-active" : ""}
                  tooltip={r.focusOverride === "raise" ? "중요 고객 해제" : "중요 고객으로 등록"}
                  aria-label={r.focusOverride === "raise" ? "중요 고객 해제" : "중요 고객으로 등록"}
                  onClick={(e) => toggleImportant(e, r)}
                />
                <Avatar name={r.name} size={30} tone={r.type === "personal" ? "personal" : "company"} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.dormant ? "var(--fg-muted)" : undefined }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[r.person, r.sub].filter(Boolean).join(" · ") || "—"}
                    {r.kind === "lead" && r.deals?.length > 0 && (() => {
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

              {/* 2. 최근 접점 */}
              <div className="hub-lc-m" style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.last !== "—" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Iconed name="signal" size={11} style={{ color: "var(--fg-dim)" }} />
                    <span className="mono" style={{ fontSize: 11.5 }}>{r.last}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>기록 없음</span>
                )}
              </div>

              {/* 3. 다음 행동 · 일정 */}
              <div className="hub-lc-m" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                {r.dormant ? (
                  <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>기약 없음 (휴면)</span>
                ) : r.nextAction ? (
                  <>
                    <span style={{ fontSize: 12, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.nextAction}
                    </span>
                    {r.nextActionAt && (
                      <span className="mono" style={{ fontSize: 10.5, padding: "1px 5px", background: "var(--surface-3)", borderRadius: "var(--r-xs)", color: "var(--fg-muted)", flexShrink: 0 }}>
                        {r.nextActionAt.slice(5, 10)}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>—</span>
                )}
              </div>

              {/* 4. 진행 상황 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <Badge tone="neutral" size="xs" variant="outline">{r.kind === "account" ? "계약 고객" : r.stage}</Badge>
                {r.valueNum > 0 && (
                  <div className="num hub-lc-m" style={{ fontSize: 12.5, fontWeight: 500, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)" }}>
                    {fmtMoney(r.valueNum)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      {deleteNotice && (
        <div
          role={deleteNotice.tone === "err" ? "alert" : "status"}
          aria-live="polite"
          className="fade-up"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 40,
            padding: "8px 16px",
            background: "var(--surface-3)",
            color: "var(--fg)",
            border: `1px solid ${deleteNotice.tone === "err" ? "var(--danger)" : "var(--line-strong)"}`,
            borderRadius: "var(--r)",
            boxShadow: "var(--shadow-pop)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span style={{ display: "inline-flex", color: deleteNotice.tone === "err" ? "var(--danger)" : "var(--moon-300)" }}>
            <Iconed name={deleteNotice.tone === "err" ? "bell" : "check"} size={15} />
          </span>
          <span style={{ minWidth: 0 }}>{deleteNotice.label}</span>
          {deleteNotice.undo ? (
            <Button variant="ghost" size="xs" onClick={deleteNotice.undo} style={{ color: "var(--moon-200)", fontWeight: 600 }}>
              되돌리기 (취소)
            </Button>
          ) : (
            <IconButton icon="x" size={20} iconSize={12} tooltip="닫기" onClick={() => setDeleteNotice(null)} />
          )}
        </div>
      )}

      {openRow && (
        <Customer360Drawer
          key={openRow.key}
          row={openRow}
          onClose={() => setOpenKey(null)}
          onNavigate={onNavigate}
          onDelete={deleteCustomer}
          onFocusChange={(key, val) => setFocusOverrides(prev => ({ ...prev, [key]: val }))}
          onLabelsSaved={reloadLedger}
        />
      )}

      <NewCustomerDrawer
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={(id) => {
          setOpenKey(`lead:${id}`);
        }}
      />
    </div>
  );
}
