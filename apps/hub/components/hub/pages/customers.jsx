"use client";

// 고객 — 영업·매출의 사람 목록 하나 (2026-09-24 운영자 승인 재설계, 목업 02 · Futura).
// Leads(영업 중)·Accounts(계약)·고객 DB가 같은 기록을 세 번 보여 주던 것을 한 목록으로 합쳤다.
// "리드냐 계정이냐"는 사람이 바뀌는 게 아니라 단계가 바뀌는 것이라 단계 열 하나로 읽는다.
// 이 화면은 대부분 검색창으로 쓴다 — 그래서 검색이 제일 크다. 기본 정렬은 "다음 약속이 급한
// 순"이라 목록이 곧 할 일 순서다. 판정(세그먼트·약속·마지막 연락·정렬·검색)은 전부
// lib/sales-os/customer-list.js가 소유한다 — 이 파일은 그리기와 저장 계약만 가진다.
//
// 한 사람 = 한 드로어(Customer 360). 맨 위는 프로필이 아니라 '약속'이고, 그다음 기록(활동 +
// 연결 메모 한 줄기), 접힌 거래·정보·도움 받기 순이다. 연락 기록은 같은 드로어의 기록 모드로
// 전환해 연다(CRM 스펙 §4.3 — 활성 오버레이는 언제나 하나).

import React from "react";
import { OfficeWorkflowPanel } from '../office-workflow-panel';
import { RelatedCustomerProjects } from '../related-customer-projects';
import { ContextMemoDrawer } from '../context-memo-drawer';
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import {
  Badge, Button, IconButton, Avatar, EmptyState, TruthBadge, Kbd, Drawer,
  SegmentedControl, CheckboxRow, TextField, TextAreaField, SelectField, Skeleton,
  CertaintyBadge, ChipToggle, LifecycleBadge, DateQuickPresets, useToast,
} from "../hub-primitives";
import { useUndoableAction } from "../use-undoable-action";
import { ContactRecordForm } from "../contact-record-form";
import { SuggestionTip } from "../suggestion-tip";
import { TIP_RULE_IDS, nudgeTipReason, useCrmNudges } from "../crm-nudge";
import { useCrmKeyboard, useCrmSelection } from "../use-crm-keyboard";
import { useRevenueLedger, saveRevenueRecord, LeadEnrichmentPanel, SortHead } from "./revenue";
import { useMemoSearch } from "./use-memo-search";
import { requestPersonaChat } from "../persona-client";
import { FloatingMentorWidget } from "../floating-mentor-widget";
import { GuruGuidanceCard } from '../guru-guidance-card';
import { filterLeadsByWorkspace, filterAccountsByWorkspace } from "../workspace-map";
import { DEAL_STAGES, STAGE_FILL } from "@/lib/deal-stages";
import { isCanonicalUuid } from "@/lib/uuid";
import { UNREFERENCED_GUARD, describeReferences } from "@/lib/sales-os/customer-delete-contract";
import { LEAD_SUBJECTS, subjectLabels } from "@/lib/sales-os/lead-labels";
import { CUSTOMER_LABEL_MISSING, customerGenreOptions, customerRegionOptions, matchesCustomerLabels, normalizeGenreLabels } from "@/lib/sales-os/customer-labels";
import { REACTION_LABEL } from "@/lib/sales-os/followup-scoring";
import { isTemplateNextAction } from "@/lib/sales-os/lead-enrichment";
import {
  CUSTOMER_FOCUS_FILTERS, CUSTOMER_PHASES, CUSTOMER_SEGMENTS, DEFAULT_CUSTOMER_SEGMENT,
  channelFromPromise, countOpenWithoutPromise, customerDisplayName, customerLastContact,
  customerOrgLabel, customerPhase, customerPromise, customerSegmentCounts, inCustomerSegment,
  localDateKey, matchesCustomerFocus, matchesCustomerSearch, recordTimeLabel, shortDateLabel,
  sortCaption, sortCustomers,
} from "@/lib/sales-os/customer-list";
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

// lead score(0-100) → 계정 health와 같은 3밴드. '확인 필요' 보조 필터의 원천이다.
function scoreBand(score) {
  if (!Number.isFinite(score)) return null;
  if (score < 40) return "risk";
  if (score < 70) return "warning";
  return "ok";
}

const LEAD_STAGE_ORDER = { New: 0, Contact: 1, Qualified: 2, Customer: 3, Lost: 4 };

// 빨강 예산(DESIGN §5.3) — 약속을 놓친 행이 많아도 1px 레일은 위에서부터 이만큼만.
// 나머지는 "N일 지남" 직접 라벨이 말한다.
const MAX_DANGER_RAILS = 3;

const SCOPE_LABEL = { classin: "ClassIn", personal: "개인" };

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
      personTitle: contact?.title || l.contactTitle || null,
      phone: contact?.phone || l.contactPhone || null,
      email: contact?.email || l.contactEmail || null,
      sub: [l.region, subjectLabels(l.subjects).slice(0, 2).join("·"), l.genres?.[0] ? `#${l.genres[0]}` : null].filter(Boolean).join(" · "),
      region: l.region || "",
      subjects: Array.isArray(l.subjects) ? l.subjects : [],
      genres: Array.isArray(l.genres) ? l.genres : [],
      labelSource: l.labelSource || {},
      source: l.source && l.source !== "—" ? l.source : "",
      stage: l.stage,
      stageOrder: LEAD_STAGE_ORDER[l.stage] ?? 0,
      health: scoreBand(l.score),
      healthScore: Number.isFinite(l.score) ? l.score : null,
      nextAction: l.nextAction || "",
      nextActionAt: l.nextActionAt || null,
      // 이관 스크립트가 채운 문구인지(mapLead가 isTemplateNextAction으로 이미 계산해 둔 값) —
      // customerPromise가 이 신호로 "약속"과 "제안"을 가른다(2026-09-24, CRM 스펙 §4.1 결정 C).
      nextActionIsTemplate: Boolean(l.nextActionIsTemplate),
      last: l.last || "—",
      lastContactAt: l.lastContactAt || null,
      lastReaction: l.lastReaction || null,
      createdAt: l.createdAt || null,
      focusOverride: l.focusOverride || "default",
      valueNum: parseMoney(l.value),
      dormant: Boolean(l.dormant),
      dormantSince: l.dormantSince || null,
      tags: Array.isArray(l.enrichmentTags) ? l.enrichmentTags : [],
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
      sub: [a.region, subjectLabels(a.subjects).slice(0, 2).join("·"), a.genres?.[0] ? `#${a.genres[0]}` : null].filter(Boolean).join(" · "),
      region: a.region || "",
      subjects: Array.isArray(a.subjects) ? a.subjects : [],
      genres: Array.isArray(a.genres) ? a.genres : [],
      labelSource: a.labelSource || {},
      source: "",
      stage: "고객",
      stageOrder: 90,
      health: a.health,
      healthScore: null,
      nextAction: a.nextAction || "",
      nextActionAt: a.nextActionAt || null,
      // 계약 고객(account) 행은 mapAccount가 이 신호를 계산해 주지 않으므로 여기서 같은 판정을
      // 직접 쓴다 — 목록·이관 스크립트가 쓰는 정본과 같은 함수(lead-enrichment.isTemplateNextAction).
      nextActionIsTemplate: isTemplateNextAction(a.nextAction),
      last: a.last || "—",
      lastContactAt: null,
      lastReaction: null,
      createdAt: null,
      focusOverride: a.focusOverride || "default",
      valueNum: Number(a.value) || 0,
      dealCount: Number(a.deals) || 0,
      dormant: Boolean(a.dormant),
      dormantSince: null,
      tags: [],
      type: a.type,
      deals: (a.companyId && dealsByCompany.get(a.companyId)) || [],
      raw: null,
    };
  });

  return [...leadRows, ...accountRows];
}

function useMediaQuery(query) {
  const [matches, setMatches] = React.useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false
  ));
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

function isTypingTarget(el) {
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

// ── Customer 360 드로어 ──────────────────────────────────────────────────────

const ACT_ICON = { email: "email", meeting: "calendar", call: "signal", note: "edit", deal: "deals", kakao: "chat", quote: "orders", ai: "sparkle", info_session: "brief", demo: "play", visit: "building", update: "rhythm", memo: "pencil" };
const ACT_LABEL = { email: "이메일", meeting: "미팅", call: "통화", note: "노트", deal: "거래", kakao: "카카오", quote: "견적", ai: "AI", info_session: "설명회", demo: "데모", visit: "방문", update: "업데이트", memo: "메모" };
// crm_activities.reaction 어휘(0016 CHECK)의 라벨은 followup-scoring이 정본(파일 상단 import).
// 컨택 시트가 필수로 받는 반응이 타임라인에 되돌아온다(0a).

// 기록 한 줄기 — 활동(crm_activities)과 이 고객에 연결한 메모(journal)를 시간순으로 섞는다.
// 메모는 열어 보기만, 활동은 되돌리기 가능한 삭제까지.
function ActivityTimeline({ rows, today, onDeleteActivity, onOpenMemo }) {
  if (!rows.length) {
    return <p className="customer-tl__empty">아직 기록이 없어요. 연락하고 나서 [연락 기록]으로 30초만 남겨 두세요.</p>;
  }
  return (
    <ol className="customer-tl">
      {rows.map((a, i) => {
        const memo = a.source === "memo";
        const deletable = onDeleteActivity && a.id && !String(a.id).startsWith("local-") && !memo;
        const when = recordTimeLabel(a.occurredAt, today, a.at || "방금");
        const body = (
          <>
            <span className="customer-tl__title">{a.msg || "—"}</span>
            {a.detail && <span className="customer-tl__detail">{a.detail}</span>}
            <span className="customer-tl__meta">
              <span>{ACT_LABEL[a.type] || a.type}</span>
              {/* 반응은 중립 뱃지 — 우려·거절도 여기서는 사실 표시일 뿐, 위기 표현은 별도 채널(§5.3). */}
              {a.reaction && <Badge tone="neutral" size="xs" variant="outline">{REACTION_LABEL[a.reaction] || a.reaction}</Badge>}
              <span className="mono">{when}</span>
            </span>
          </>
        );
        return (
          <li key={a.id || i} className="customer-tl__item">
            <span className="customer-tl__dot" aria-hidden="true"><Iconed name={ACT_ICON[a.type] || "edit"} size={11} /></span>
            {memo ? (
              <button type="button" className="hub-row customer-tl__body customer-tl__body--link" onClick={() => onOpenMemo?.(a.noteId)}>{body}</button>
            ) : (
              <div className="customer-tl__body">{body}</div>
            )}
            {deletable && (
              <IconButton
                icon="x"
                size={24}
                iconSize={11}
                tooltip="기록 삭제 (되돌리기 지원)"
                aria-label="기록 삭제"
                onClick={() => onDeleteActivity(a)}
              />
            )}
          </li>
        );
      })}
    </ol>
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
        placeholder="연락이 아닌 메모를 남기면 기록에 한 줄로 쌓여요"
        rows={3}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="secondary" size="sm" onClick={save} disabled={!text.trim()}>메모 저장</Button>
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
      {deals.map(d => (
        <div key={d.id} className="customer-deal">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
            <div style={{ marginTop: 4 }}><DealStageRail stage={d.stage} /></div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="num customer-money">{fmtMoney(d.value)}</div>
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
      {phase === "checking" ? "확인 중…" : "고객 삭제"}
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
          // 10px 텍스트 버튼은 §8.1 크기 플로어 위반이었다 — 공용 Button(12px)으로.
          <Button variant="ghost" size="xs" aria-expanded={open} onClick={() => setOpen(false)}>
            접기
          </Button>
        )}
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>고객 맥락에 맞는 초안을 작성하고 있습니다…</div>
          ) : draftText ? (
            <>
              <div
                style={{
                  background: "var(--surface-3)",
                  padding: "8px 10px",
                  borderRadius: "var(--r-xs)",
                  fontSize: 12,
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
      <h4 className="customer-kv__label">과목 · 지역 · 장르</h4>
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
            {/* 드로어의 primary는 '연락 기록' 하나 — 접힌 섹션의 저장은 secondary다. */}
            <Button variant="secondary" size="sm" disabled={!row.id || !changed || saving} onClick={save}>{saving ? "저장 중…" : "라벨 저장"}</Button>
          </div>
        </div>
      </details>
    </section>
  );
}

// ── 다음 약속 카드 ───────────────────────────────────────────────────────────
// 드로어 맨 위는 프로필이 아니라 약속이다. 이 사람과 다음에 뭘 하기로 했는지가 먼저 보이고,
// 버튼 두 개로 끝난다 — 했으면 기록, 못 했으면 날짜 다시.
function PromiseEditor({ mode, initialWhat = "", busy, error, onSave, onCancel }) {
  const [what, setWhat] = React.useState(initialWhat);
  const [at, setAt] = React.useState("");
  const [missing, setMissing] = React.useState("");
  const needsWhat = mode === "set";
  const submit = () => {
    if (needsWhat && !what.trim()) { setMissing("무엇을 하기로 했는지 한 줄 적어 주세요."); return; }
    if (!at) { setMissing("날짜를 고르세요."); return; }
    setMissing("");
    onSave({ what: needsWhat ? what.trim() : undefined, at });
  };
  return (
    <div className="customer-promise__editor" role="group" aria-label={needsWhat ? "약속 정하기" : "날짜 다시 정하기"}>
      {needsWhat && (
        <TextField label="무엇을" value={what} onChange={e => { setWhat(e.target.value); setMissing(""); }} placeholder="예: 견적서 보내기" autoFocus />
      )}
      <div className="customer-promise__dates">
        <TextField
          label="언제"
          type="date"
          value={at}
          onChange={e => { setAt(e.target.value); setMissing(""); }}
          className="mono"
          fieldStyle={{ flex: "1 1 150px" }}
          style={{ padding: "0 10px" }}
          autoFocus={!needsWhat}
        />
        <DateQuickPresets onPick={(value) => { setAt(value); setMissing(""); }} disabled={busy} style={{ flexWrap: "wrap", gap: 4, paddingBottom: 1 }} />
      </div>
      {(missing || error) && <p role="alert" className="customer-promise__msg" data-error={error && !missing ? "true" : undefined}>{missing || error}</p>}
      <div className="customer-promise__actions">
        <Button variant="secondary" size="sm" onClick={submit} disabled={busy}>{busy ? "저장 중…" : "약속 저장"}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>취소</Button>
      </div>
    </div>
  );
}

function PromiseCard({ promise, tip: nudgeTip, busy, error, onRecord, onSave }) {
  const [editor, setEditor] = React.useState(null); // null | "reschedule" | "set"
  const late = promise.state === "dated" && promise.late > 0;
  const save = async (value) => {
    const ok = await onSave(value);
    if (ok) setEditor(null);
  };

  let what; let when = null; let actions = null;
  if (promise.state === "dated" || promise.state === "undated") {
    what = promise.what || "다음 약속";
    when = promise.state === "dated"
      ? (late
        ? <><span className="customer-promise__late">{promise.late}일 지남</span> · {promise.dateLabel} 약속</>
        : <>{promise.whenLabel === promise.dateLabel ? `${promise.dateLabel} 약속` : `${promise.whenLabel} · ${promise.dateLabel}`}</>)
      : "날짜를 아직 안 정했어요";
    actions = (
      <>
        <Button variant="outline" size="sm" icon="check" onClick={() => onRecord({ kind: channelFromPromise(promise.what) }, { summary: promise.what })}>했어요 · 기록</Button>
        <Button variant="ghost" size="sm" aria-expanded={editor === "reschedule"} onClick={() => setEditor(editor ? null : "reschedule")}>
          {promise.state === "dated" ? "날짜 다시" : "날짜 정하기"}
        </Button>
      </>
    );
  } else if (promise.state === "dormant") {
    what = promise.days != null ? `기약 없음 · ${promise.days}일째` : "기약 없음";
    actions = <Button variant="outline" size="sm" aria-expanded={editor === "set"} onClick={() => setEditor(editor ? null : "set")}>약속 정하기</Button>;
  } else if (promise.state === "closed") {
    what = "종료된 고객";
  } else if (promise.state === "template") {
    // 이관·시트 템플릿 문구는 약속이 아니다 — "다음 약속 없음"으로 말하고, 문구는 아래
    // 제안 팁의 [약속으로 정하기]가 대신 낸다(같은 버튼을 두 번 두지 않는다).
    what = "다음 약속 없음";
  } else {
    what = "아직 정하지 않았어요";
    actions = <Button variant="outline" size="sm" aria-expanded={editor === "set"} onClick={() => setEditor(editor ? null : "set")}>약속 정하기</Button>;
  }
  const muted = !(promise.state === "dated" || promise.state === "undated");

  // 한 사람당 팁은 하나(§ 예산). 넛지(우려·거절 뒤 정리 안 됨 · 기약 없음 재확인)가 있으면
  // 그게 이긴다 — 더 구체적이고 급한 신호다. 없을 때만 템플릿 제안으로 내려간다.
  const tip = nudgeTip || (promise.state === "template" ? {
    reason: promise.suggestion,
    action: "약속으로 정하기",
    onAction: () => setEditor(editor ? null : "set"),
  } : null);

  return (
    <section className="customer-promise" data-late={late ? "true" : undefined} aria-label="다음 약속">
      <h3 className="fx-eyebrow customer-eyebrow">다음 약속</h3>
      <p className="customer-promise__what" data-muted={muted ? "true" : undefined}>{what}</p>
      {when && <p className="customer-promise__when">{when}</p>}
      {editor ? (
        <PromiseEditor
          key={editor}
          mode={editor}
          initialWhat={editor === "set" ? (promise.state === "template" ? promise.suggestion : promise.what) : ""}
          busy={busy}
          error={error}
          onSave={save}
          onCancel={() => setEditor(null)}
        />
      ) : (
        <>
          {error && <p role="alert" className="customer-promise__msg" data-error="true">{error}</p>}
          {actions && <div className="customer-promise__actions">{actions}</div>}
          {tip && (
            <div className="customer-promise__tip">
              <SuggestionTip reason={tip.reason} action={tip.action} onAction={tip.onAction} onSnooze={tip.onSnooze} onDismiss={tip.onDismiss} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

// 전화·카톡·메일 — 데이터가 있을 때만. 카톡은 API가 없어 번호 복사까지만 한다.
function QuickContactActions({ row, onCopied }) {
  if (!row.phone && !row.email) {
    return <span className="customer-drawer-id__none">연락처가 아직 없어요</span>;
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.phone);
      onCopied?.(true);
    } catch {
      onCopied?.(false);
    }
  };
  return (
    <div className="customer-quick" role="group" aria-label="바로 연락">
      {row.phone && <Button variant="outline" size="sm" icon="signal" onClick={() => window.location.assign(`tel:${String(row.phone).replace(/[^\d+]/g, "")}`)}>전화</Button>}
      {row.phone && <Button variant="outline" size="sm" icon="copy" onClick={copy}>카톡용 번호 복사</Button>}
      {row.email && <Button variant="outline" size="sm" icon="email" onClick={() => window.location.assign(`mailto:${row.email}`)}>메일</Button>}
    </div>
  );
}

function Customer360Drawer({ row, today, recordRequest, onRecordRequestConsumed, onClose, onNavigate, onDelete, onFocusChange, onLabelsSaved, onPromiseSaved, onRecordPersisted, onRecordFailed, nudge, onNudgeEscape }) {
  const toast = useToast();
  const mobile = useMediaQuery("(max-width: 600px)");
  const [memoState, setMemoState] = React.useState(null);
  const memoContexts = React.useMemo(() => [{ type: row.kind, id: row.id, label: row.person || row.name }], [row.kind, row.id, row.person, row.name]);
  const [activities, setActivities] = React.useState([]);
  const [actSync, setActSync] = React.useState("loading");
  const [focusOverride, setFocusOverride] = React.useState(row.focusOverride || "default");
  React.useEffect(() => { setFocusOverride(row.focusOverride || "default"); }, [row.focusOverride]);

  // 기록 모드 — 같은 드로어 안에서 공용 기록창으로 전환한다. { preset, draft, error }
  const [record, setRecord] = React.useState(null);
  const [recordSeq, setRecordSeq] = React.useState(0);
  const recordRef = React.useRef(record);
  recordRef.current = record;
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const startRecord = React.useCallback((preset = {}, draft = null, error = "") => {
    setRecord({ preset: Object.fromEntries(Object.entries(preset || {}).filter(([, v]) => v != null && v !== "")), draft, error });
    setRecordSeq((n) => n + 1);
  }, []);
  // 늦은 실패로 부모가 기록창을 입력 그대로 다시 열어 달라고 할 때.
  React.useEffect(() => {
    if (!recordRequest || recordRequest.key !== row.key) return;
    startRecord({}, recordRequest.draft || null, recordRequest.error || "");
    onRecordRequestConsumed?.();
  }, [recordRequest, row.key, startRecord, onRecordRequestConsumed]);

  const { schedule: scheduleActUndo, cancel: cancelActUndo } = useUndoableAction();
  const [actNotice, setActNotice] = React.useState(null);
  const [guruOpen, setGuruOpen] = React.useState(false);
  const [guruGuidanceId, setGuruGuidanceId] = React.useState(null);
  const [guruQuestion, setGuruQuestion] = React.useState('');

  const [promiseBusy, setPromiseBusy] = React.useState(false);
  const [promiseError, setPromiseError] = React.useState("");
  const promise = customerPromise(row, today);
  const displayName = customerDisplayName(row);
  const org = customerOrgLabel(row);
  const phase = CUSTOMER_PHASES[customerPhase(row)];
  // 이 사람의 넛지(우려·거절 뒤 정리 안 됨 · 기약 없음 재확인) — 있으면 [다음 약속] 카드의
  // 팁으로 뜬다(템플릿 제안보다 우선, PromiseCard 안에서 결정). 행동은 이 드로어의 기록
  // 시트(startRecord)를 그대로 연다 — 새 폼을 만들지 않는다.
  const promiseTip = React.useMemo(() => {
    if (!nudge) return null;
    const escapes = Array.isArray(nudge.escape) ? nudge.escape : [];
    return {
      reason: nudgeTipReason(nudge),
      action: nudge.action?.label,
      onAction: () => startRecord(nudge.action?.prefill?.kind ? { kind: nudge.action.prefill.kind } : {}),
      onSnooze: escapes.includes("snooze") ? (until) => onNudgeEscape?.(nudge, "snooze", until) : undefined,
      onDismiss: escapes.includes("dismiss") ? () => onNudgeEscape?.(nudge, "dismiss") : undefined,
    };
  }, [nudge, onNudgeEscape, startRecord]);

  const [actError, setActError] = React.useState(null);
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

  // 이 고객에 직접 연결한 메모 — 기록 한 줄기에 시간순으로 섞는다(RelatedMemos와 같은 조회).
  const memoEnabled = (row.kind === "lead" || row.kind === "account") && isCanonicalUuid(row.id);
  const memoQuery = memoEnabled
    ? `${new URLSearchParams({ contextType: row.kind, contextId: String(row.id).toLowerCase() })}&limit=3`
    : "";
  const memos = useMemoSearch(memoQuery, { enabled: memoEnabled });

  const stream = React.useMemo(() => {
    const t = (value) => {
      const n = Date.parse(value || "");
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; // 저장 전 낙관 행은 맨 위
    };
    const acts = activities.map(a => ({ ...a, source: "activity" }));
    const notes = memoEnabled && memos.status === "live"
      ? memos.entries.map(e => ({
        id: `memo:${e.id}`, noteId: e.id, source: "memo", type: "memo",
        msg: e.title || e.excerpt || "제목 없는 메모",
        detail: e.title ? e.excerpt : "",
        occurredAt: e.occurredAt,
      }))
      : [];
    return [...acts, ...notes].sort((a, b) => t(b.occurredAt) - t(a.occurredAt));
  }, [activities, memos.status, memos.entries, memoEnabled]);

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

  // 약속만 옮긴다 — 연락 기록이 아니므로 RPC가 아니라 리드·계정 update 라우트(next_action·
  // next_action_at 스네이크 키, customer-promise.js). 저장 확인 뒤에만 목록에 반영한다.
  const savePromise = async ({ what, at }) => {
    if (!row.id) { setPromiseError("저장된 고객이 아니라 약속을 저장할 수 없어요."); return false; }
    setPromiseBusy(true);
    setPromiseError("");
    const patch = { id: row.id };
    if (what !== undefined) patch.next_action = what;
    if (at !== undefined) patch.next_action_at = at;
    const result = await saveRevenueRecord(row.kind === "account" ? "account" : "lead", "update", patch);
    if (!mountedRef.current) return result.ok;
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseError(result.status === "preview"
        ? "Preview · 연결 필요 — 약속이 저장되지 않았어요."
        : `약속을 저장하지 못했어요 (${result.status}). 다시 시도하세요.`);
      return false;
    }
    onPromiseSaved?.(row, {
      ...(what !== undefined ? { nextAction: what } : {}),
      ...(at !== undefined ? { nextActionAt: at, dormant: false, dormantSince: null } : {}),
    });
    toast.success(at ? `약속 저장됨 · ${shortDateLabel(at)}` : "다음 행동 저장됨");
    return true;
  };

  // R — 연락 기록. 입력 중이거나 이 드로어 위에 다른 대화상자가 있으면 양보한다.
  React.useEffect(() => {
    if (record || memoState || guruOpen) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "r" && e.key !== "R") return;
      if (isTypingTarget(document.activeElement)) return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      e.preventDefault();
      startRecord();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, memoState, guruOpen, startRecord]);

  // 이 드로어는 접촉 기록용 360 뷰 — 이름·연락처·단계의 원본 편집은 리드 정식 편집기
  // (?lead= 딥링크)가 담당한다. 계약 고객(account)은 아직 ?account= 딥링크가 없어
  // followups ActivityPanel과 같은 규칙으로 링크를 숨긴다.
  const editHref = row.kind !== "account" && row.id
    ? `dashboard/revenue/leads?lead=${encodeURIComponent(row.id)}`
    : null;

  if (memoState) return <ContextMemoDrawer contexts={memoContexts} noteId={memoState.noteId || null} onClose={() => setMemoState(null)} />;

  const recordTarget = { kind: row.kind === "account" ? "account" : "lead", id: row.id, companyId: row.companyId, name: displayName };
  const dealTotal = (row.deals || []).filter(d => d.stage !== "lost").reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  return (
    <Drawer
      title={record ? "연락 기록" : displayName}
      subtitle={record ? `${displayName}${org ? ` · ${org}` : ""}` : [org, phase.label].filter(Boolean).join(" · ")}
      onClose={record ? () => setRecord(null) : onClose}
      presentation={mobile ? "compact" : "side"}
      width="min(480px, 96vw)"
      footer={record ? (
        <div className="customer-focus-footer">
          <Button variant="ghost" size="sm" icon="chevronL" onClick={() => setRecord(null)}>고객 정보로</Button>
        </div>
      ) : (
        <div className="customer-focus-footer">
          <Button variant="primary" size="md" icon="edit" onClick={() => startRecord()} style={{ flex: 1 }}>연락 기록 <Kbd>R</Kbd></Button>
          {editHref && <Button variant="ghost" size="md" onClick={() => onNavigate?.(editHref)}>편집</Button>}
        </div>
      )}
    >
      {record ? (
        <div className="customer-focus">
          {/* 상세 안에서는 드로어를 겹치지 않고 폼만 인라인으로 쓴다(CRM 지침 §6.2 —
              활성 오버레이는 언제나 하나). 껍데기가 필요한 진입점은 ContactRecordDrawer. */}
          <ContactRecordForm
            key={recordSeq}
            target={recordTarget}
            preset={record.preset}
            draft={record.draft}
            initialError={record.error || ""}
            autoFocus
            aiContext={`${row.name || "미지정"} · ${row.kind === "account" ? "계약 고객" : `리드 (${phase.label})`}`}
            onSaved={(o) => {
              setActivities(prev => [
                { id: o.activityId, type: o.kind, msg: o.summary, at: "방금", reaction: o.reaction, occurredAt: new Date().toISOString() },
                ...prev,
              ]);
            }}
            onUndone={(optimisticId) => {
              setActivities(prev => prev.filter(a => a.id !== optimisticId));
            }}
            onSummaryPersisted={({ activityId, optimisticId }) => {
              if (!activityId) { reload(); return; }
              setActivities(prev => prev.map(a => (
                a.id === optimisticId ? { ...a, id: activityId } : a
              )));
            }}
            onPersisted={() => onRecordPersisted?.(row)}
            onFailed={({ message, form }) => onRecordFailed?.(row, {
              message,
              form,
              // 폼이 아직 떠 있으면 폼이 직접 입력을 복원하고 원인을 말한다 — 부모는 알림만.
              formMounted: mountedRef.current && Boolean(recordRef.current),
            })}
            onDone={() => { if (mountedRef.current) setRecord(null); }}
          />
          <details className="customer-sec">
            <summary><h4 className="fx-eyebrow customer-eyebrow">연락이 아닌 한 줄 메모</h4><span className="customer-sec__chev" aria-hidden="true"><Iconed name="chevronR" size={13} /></span></summary>
            <div className="customer-sec__in">
              {actError && (
                <div role="alert" style={{ fontSize: 12, color: "var(--danger)", lineHeight: 1.5 }}>
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
            </div>
          </details>
        </div>
      ) : (
        <div className="customer-focus">
          <div className="customer-drawer-id">
            <Avatar name={row.name} size={40} tone="neutral" />
            <QuickContactActions row={row} onCopied={(ok) => (ok ? toast.success("번호를 복사했어요") : toast.error("번호를 복사하지 못했어요 — 정보에서 직접 확인하세요"))} />
            <Button
              variant="outline"
              active={focusOverride === "raise"}
              aria-pressed={focusOverride === "raise"}
              size="sm"
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
          </div>

          <PromiseCard
            promise={promise}
            tip={promiseTip}
            busy={promiseBusy}
            error={promiseError}
            onRecord={(preset, draft) => startRecord(preset, draft)}
            onSave={savePromise}
          />

          {/* 기록 — 활동과 연결 메모의 한 줄기 (읽기 우선 배치) */}
          <section className="customer-record" aria-label="기록">
            <div className="customer-focus-section-heading">
              <h3 className="fx-eyebrow customer-eyebrow">기록</h3>
              {actSync !== "live" && actSync !== "loading" && actSync !== "error" && <TruthBadge state={actSync} />}
              <div style={{ flex: 1 }} />
              <Button variant="ghost" size="xs" icon="pencil" onClick={() => setMemoState({})}>메모</Button>
            </div>
            {actNotice && (
              <div role="status" aria-live="polite" className="fade-up customer-inline-notice">
                <span>{actNotice.label}</span>
                {actNotice.undo && (
                  <Button variant="ghost" size="xs" onClick={actNotice.undo}>
                    되돌리기
                  </Button>
                )}
              </div>
            )}
            {actError && (
              <p role="alert" className="customer-promise__msg" data-error="true">{actError.message}</p>
            )}
            {actSync === "loading" ? (
              <Skeleton height={14} lines={3} label="기록 불러오는 중" />
            ) : actSync === "error" ? (
              <div role="alert" className="customer-inline-error">
                <TruthBadge state="error" reason="활동 기록을 읽지 못했어요" />
                <Button variant="ghost" size="xs" onClick={reload}>다시 시도</Button>
              </div>
            ) : (
              <>
                <ActivityTimeline rows={stream.slice(0, 5)} today={today} onDeleteActivity={deleteActivity} onOpenMemo={(noteId) => setMemoState({ noteId })} />
                {stream.length > 5 && (
                  <details className="customer-sec customer-sec--flat">
                    <summary><span className="customer-sec__more">전체 기록 {stream.length}건 보기</span></summary>
                    <ActivityTimeline rows={stream.slice(5)} today={today} onDeleteActivity={deleteActivity} onOpenMemo={(noteId) => setMemoState({ noteId })} />
                  </details>
                )}
              </>
            )}
            {memoEnabled && memos.status === "error" && (
              <div role="alert" className="customer-inline-error">
                <TruthBadge state="error" reason="연결 메모를 읽지 못했어요" />
                <Button variant="ghost" size="xs" onClick={memos.refresh}>다시 시도</Button>
              </div>
            )}
          </section>

          {/* 거래 — Accounts 화면의 계약 정보가 여기로 들어온다. */}
          <details className="customer-sec">
            <summary>
              <h3 className="fx-eyebrow customer-eyebrow">거래</h3>
              <span className="customer-sec__hint num">
                {(row.deals || []).length ? `${row.deals.length}건 · ${fmtMoney(dealTotal)}` : "열린 거래 없음"}
              </span>
              <span className="customer-sec__chev" aria-hidden="true"><Iconed name="chevronR" size={13} /></span>
            </summary>
            <div className="customer-sec__in">
              {row.kind === "account" && (
                <dl className="customer-kv">
                  <dt>계약</dt><dd>계약 고객 · 거래 {row.dealCount || 0}건</dd>
                  <dt>합계</dt><dd className="num customer-money">{fmtMoney(row.valueNum)}</dd>
                </dl>
              )}
              {(row.deals || []).length > 0
                ? <DealPipelineSection deals={row.deals} />
                : <p className="customer-tl__empty">이 고객에 걸린 거래가 없어요.</p>}
              <RelatedCustomerProjects type={row.kind} id={row.id} />
            </div>
          </details>

          {/* 정보 — 필요할 때만 연다 */}
          <details className="customer-sec">
            <summary>
              <h3 className="fx-eyebrow customer-eyebrow">정보</h3>
              <span className="customer-sec__chev" aria-hidden="true"><Iconed name="chevronR" size={13} /></span>
            </summary>
            <div className="customer-sec__in">
              <dl className="customer-kv">
                {row.person && <><dt>담당자</dt><dd>{[row.person, row.personTitle].filter(Boolean).join(" · ")}</dd></>}
                <dt>연락처</dt>
                <dd className="mono">{[row.phone, row.email].filter(Boolean).join(" · ") || "—"}</dd>
                {row.source && <><dt>유입</dt><dd>{row.source}</dd></>}
                {row.raw?.scale && <><dt>규모</dt><dd>{row.raw.scale}</dd></>}
                {row.raw?.units !== "" && row.raw?.units != null && <><dt>도입 댓수</dt><dd className="num">{row.raw.units}</dd></>}
                <dt>단계</dt><dd><LifecycleBadge state={phase.lifecycle} label={phase.label} /></dd>
              </dl>

              <CustomerLabelsEditor row={row} onSaved={onLabelsSaved} />

              {/* 포커스 오버라이드 — 숫자 편집 없이 3단 조정만 (spec §7 확정 규칙) */}
              <div className="customer-kv__row">
                <span className="customer-kv__label">포커스</span>
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

              {/* 왜 이렇게 보이나 — 리드 enrichment 분류·증거 (점수는 헤더가 아니라 여기) */}
              {row.raw && <LeadEnrichmentPanel lead={row.raw} />}

              <div className="customer-danger-zone">
                <CustomerDeleteAction row={row} onConfirm={onDelete} />
              </div>
            </div>
          </details>

          {/* 도움 받기 — 답장 초안·코칭은 필요할 때만 (표면 예산) */}
          <details className="customer-sec">
            <summary>
              <h3 className="fx-eyebrow customer-eyebrow">도움 받기</h3>
              <span className="customer-sec__hint">답장 초안 · 코칭</span>
              <span className="customer-sec__chev" aria-hidden="true"><Iconed name="chevronR" size={13} /></span>
            </summary>
            <div className="customer-sec__in">
              <GuruGuidanceCard domain="sales" compact onAsk={card => {
                setGuruGuidanceId(card.id);
                setGuruQuestion(card.question);
                setGuruOpen(true);
              }} />
              <OfficeWorkflowPanel
                key={row.key}
                intent="customer_reply"
                scope={row.workspace === 'classin' || row.type === 'company' ? 'classin' : row.workspace === 'brand' || row.type === 'personal' ? 'personal' : null}
                originRef={{ entityType: row.kind === 'account' ? 'customer_account' : 'lead', entityId: row.id }}
                title="답장 초안"
                onNavigate={onNavigate}
              />
              <CustomerOutreachDrafter row={row} />
            </div>
          </details>
        </div>
      )}

      {guruOpen && (
        <FloatingMentorWidget
          isOpen={guruOpen}
          onClose={() => { setGuruOpen(false); setGuruGuidanceId(null); }}
          agent="guru"
          guidanceId={guruGuidanceId}
          initialTab="chat"
          initialQuestion={guruQuestion}
          contextType="customer"
          contextTitle={row.person || row.name || "고객 전략 코칭"}
          contextData={{
            id: row.id,
            name: row.person || row.name,
            company: row.name,
            stage: phase.label,
            health: row.health,
            nextAction: row.nextAction,
            notes: row.notes || row.sub,
          }}
          onApplyText={(text) => {
            // 표시 모델 키(nextAction)는 라우트가 무시한다 — 약속 쓰기 계약의 next_action으로 보낸다.
            savePromise({ what: text.slice(0, 100) });
          }}
        />
      )}
    </Drawer>
  );
}

// ── 새 고객 등록 드로어 (No ghost records) ──────────────────────────────────
// 저장 버튼을 누를 때만 영속 DB에 생성하고, 취소 시 빈 고객 레코드를 남기지 않는다.
// 첫 약속(무엇 + 언제)을 함께 받는다 — 약속이 정본이다(CRM 스펙 §0.5). 담당자·연락처 칸은
// 없앴다: 리드 생성 경로에 연락처 쓰기가 없어 입력이 조용히 버려지고 있었다.
function NewCustomerDrawer({ initialName = "", workspace = null, onClose, onCreated }) {
  const [name, setName] = React.useState(initialName);
  const [stage, setStage] = React.useState("New");
  const [nextAction, setNextAction] = React.useState("");
  const [nextActionAt, setNextActionAt] = React.useState("");
  const [isImportant, setIsImportant] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("고객 또는 학원명을 입력하세요.");
      return;
    }
    if (nextActionAt && !nextAction.trim()) {
      setError("날짜를 골랐다면 무엇을 하기로 했는지도 한 줄 적어 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await saveRevenueRecord("lead", "create", {
        name: trimmedName,
        stage,
        ...(nextAction.trim() ? { next_action: nextAction.trim() } : {}),
        ...(nextActionAt ? { next_action_at: nextActionAt } : {}),
        ...(workspace ? { workspace } : {}),
        focusOverride: isImportant ? "raise" : "default",
      });
      setSubmitting(false);
      if (res.ok && res.id) {
        onCreated(res.id, trimmedName);
        onClose();
      } else {
        setError(res.status === "preview"
          ? "Preview · 연결 필요 — 고객이 저장되지 않았습니다."
          : `고객 생성 실패 (${res.status || "오류"}) — 다시 시도하세요.`);
      }
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Drawer
      title="새 고객"
      subtitle="이름만 있으면 됩니다 — 나머지는 나중에"
      onClose={onClose}
      presentation="compact"
      width="min(480px, 96vw)"
      footer={(
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>취소</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={submitting}>
            {submitting ? "등록 중…" : "고객 등록"}
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
          placeholder="예: 한빛수학학원 김원장"
          autoFocus
        />
        <TextField
          label="다음 약속"
          value={nextAction}
          onChange={e => { setNextAction(e.target.value); setError(""); }}
          placeholder="예: 소개서 보내고 첫 통화"
        />
        <div className="customer-promise__dates">
          <TextField
            label="언제"
            type="date"
            value={nextActionAt}
            onChange={e => { setNextActionAt(e.target.value); setError(""); }}
            className="mono"
            fieldStyle={{ flex: "1 1 150px" }}
            style={{ padding: "0 10px" }}
          />
          <DateQuickPresets onPick={(value) => { setNextActionAt(value); setError(""); }} style={{ flexWrap: "wrap", gap: 4, paddingBottom: 1 }} />
        </div>
        <details className="customer-sec">
          <summary><span className="customer-sec__more">단계 · 중요 고객</span><span className="customer-sec__chev" aria-hidden="true"><Iconed name="chevronR" size={13} /></span></summary>
          <div className="customer-sec__in">
            <SelectField
              label="초기 단계"
              value={stage}
              onChange={e => setStage(e.target.value)}
              options={[
                { value: "New", label: "신규" },
                { value: "Contact", label: "연락 중" },
                { value: "Qualified", label: "검증" },
              ]}
            />
            <CheckboxRow
              checked={isImportant}
              onChange={setIsImportant}
              text="⭐ 중요 고객으로 등록 (집중도 높임)"
            />
          </div>
        </details>
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
      </div>
    </Drawer>
  );
}

// ── 목록 ────────────────────────────────────────────────────────────────────

function PromiseCell({ promise, tip }) {
  if (promise.state === "dated") {
    const late = promise.late > 0;
    return (
      <div className="customers-next">
        <span className="customers-next__what">{promise.what || "다음 약속"}</span>
        <span className="customers-next__when">
          <span data-late={late ? "true" : undefined}>
            {late && <span className="customers-next__glyph" aria-hidden="true"><Iconed name="clock" size={11} /></span>}
            {promise.whenLabel}
          </span>
          {late && <span> · {promise.dateLabel}</span>}
        </span>
      </div>
    );
  }
  if (promise.state === "undated") {
    return (
      <div className="customers-next">
        <span className="customers-next__what">{promise.what}</span>
        <span className="customers-next__when">날짜 없음</span>
      </div>
    );
  }
  const label = promise.state === "dormant" ? "기약 없음" : promise.state === "closed" ? "종료" : "다음 약속 없음";
  // 한 사람당 팁 하나 — 넛지가 있으면 그게 이긴다(reaction_open·dormant_recheck), 없으면
  // 템플릿 문구뿐일 때만 그 문구를 제안으로 보여준다. 행 전체가 이미 클릭 가능한 컨테이너라
  // (role="button") 여기서는 compact(버튼 없는 정보 표시)만 쓴다 — 실제 조작은 드로어에서.
  const cellTip = tip || (promise.state === "template" ? { reason: promise.suggestion } : null);
  return (
    <div className="customers-next" data-empty="true">
      <span className="customers-next__what">{label}</span>
      {cellTip && (
        <div className="customers-next__tip">
          <SuggestionTip reason={cellTip.reason} compact />
        </div>
      )}
    </div>
  );
}

function CustomerRow({ row, today, selected, rail, nudge, onOpen, onSelect }) {
  const promise = customerPromise(row, today);
  // compact 팁은 정보만(버튼 없음, 위 SuggestionTip 주석) — 행 전체가 이미 클릭 가능하다.
  const nudgeTip = nudge ? { reason: nudgeTipReason(nudge) } : null;
  const phase = CUSTOMER_PHASES[customerPhase(row)];
  const last = customerLastContact(row, today);
  const org = customerOrgLabel(row) || row.sub;
  const open = () => { onSelect(row.key); onOpen(row.key); };
  return (
    <div
      className="hub-row customers-grid customers-row"
      role="button"
      tabIndex={0}
      data-customer-row={row.key}
      data-selected={selected ? "true" : undefined}
      data-urgent={rail ? "true" : undefined}
      aria-label={`${customerDisplayName(row)}${org ? `, ${org}` : ""} — ${phase.label}${promise.late ? `, 약속 ${promise.late}일 지남` : ""}`}
      onClick={open}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
    >
      <div className="customers-cell customers-cell--who">
        <Avatar name={row.name} size={30} tone="neutral" />
        <div className="customers-who">
          <span className="customers-who__name">
            {row.focusOverride === "raise" && <span className="customers-who__star" role="img" aria-label="중요 고객"><Iconed name="star" size={12} /></span>}
            {customerDisplayName(row)}
          </span>
          {org && <span className="customers-who__org">{org}</span>}
        </div>
      </div>
      <div className="customers-cell customers-cell--phase">
        <LifecycleBadge state={phase.lifecycle} label={phase.label} />
      </div>
      <div className="customers-cell customers-cell--next">
        <PromiseCell promise={promise} tip={nudgeTip} />
      </div>
      <div className="customers-cell customers-cell--last">
        {last.known ? (
          <span className="customers-last">
            {last.reaction || (row.kind === "account" ? "변경" : "연락")}
            <small>{last.days != null ? (last.days <= 0 ? "오늘" : last.days === 1 ? "어제" : `${last.days}일 전`) : last.label}</small>
          </span>
        ) : (
          <span className="customers-last" data-empty="true">{last.label}</span>
        )}
      </div>
      <div className="customers-cell customers-cell--money">
        <span className="num customers-money" data-empty={row.valueNum > 0 ? undefined : "true"}>{fmtMoney(row.valueNum)}</span>
      </div>
    </div>
  );
}

// 읽기 실패는 빈 목록이 아니다 — "고객이 없습니다"로 그리면 이미 있는 고객을 또 만든다.
function CustomersReadError({ onRetry }) {
  return (
    <div role="alert" className="customers-state">
      <TruthBadge state="error" reason="고객 기록을 읽지 못했어요" />
      <p>지금 비어 보여도 실제 고객이 있을 수 있어요. 새로 만들기 전에 다시 읽어 확인하세요.</p>
      <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>다시 읽기</Button>
    </div>
  );
}

// ── 페이지 ──────────────────────────────────────────────────────────────────

export function Customers({ onNavigate }) {
  const toast = useToast();
  const { ledger, syncState, reload: reloadLedger } = useRevenueLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // 사이드바 스코프는 ?scope=로만 도착한다(revenue-scope-filter.js 머리 주석). classin은
  // workspace-map의 회사 레인, personal은 개인 유형 — ClassIn 고객 탭이 이 화면을 가리킬 수 있다.
  const queryScope = searchParams?.get("scope") || null;
  const scopeKey = queryScope === "classin" || queryScope === "personal" ? queryScope : null;
  const scopedLedger = React.useMemo(() => {
    if (scopeKey === "classin") {
      return { ...ledger, leads: filterLeadsByWorkspace(ledger.leads, "classin"), accounts: filterAccountsByWorkspace(ledger.accounts, "classin") };
    }
    if (scopeKey === "personal") {
      return { ...ledger, leads: (ledger.leads || []).filter(l => l.type === "personal"), accounts: (ledger.accounts || []).filter(a => a.type === "personal") };
    }
    return ledger;
  }, [ledger, scopeKey]);

  const [segment, setSegment] = React.useState(DEFAULT_CUSTOMER_SEGMENT);
  const [search, setSearch] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [focusFilter, setFocusFilter] = React.useState("");
  const [regionFilter, setRegionFilter] = React.useState("");
  const [subjectFilter, setSubjectFilter] = React.useState("");
  const [genreFilter, setGenreFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [sort, setSort] = React.useState({ key: "promise", dir: "asc" });
  const [openKey, setOpenKey] = React.useState(null);
  const [createError, setCreateError] = React.useState(null);
  const [focusOverrides, setFocusOverrides] = React.useState({});
  // 약속 저장이 확인된 값 — 기록을 다시 읽으면(ledger 교체) 서버 값이 정본이므로 비운다.
  const [promiseOverrides, setPromiseOverrides] = React.useState({});
  React.useEffect(() => { setPromiseOverrides({}); }, [ledger]);
  // 삭제는 3.5초 뒤에야 POST된다 — 그동안 행은 목록에서 빠져 있고, 되돌리면 그대로 돌아온다.
  const [deletedKeys, setDeletedKeys] = React.useState(() => new Set());
  const [deleteNotice, setDeleteNotice] = React.useState(null);
  const [newCustomer, setNewCustomer] = React.useState(null); // null | { name }
  const [pendingOpen, setPendingOpen] = React.useState(null); // { key, ledger } — 생성 직후 열기
  const [recordRequest, setRecordRequest] = React.useState(null);
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();

  // 넛지는 더 이상 전용 섹션이 아니다(운영자 2026-09-24) — 대상 행·드로어에 붙는 제안 팁
  // 하나로 나온다. TIP_RULE_IDS가 이미 다른 화면 요소로 대표되는 규칙(놓친 약속 자체·다음
  // 약속 없음 카드 등)을 걸러 낸다.
  const crmNudges = useCrmNudges();
  const nudgesBySubjectId = React.useMemo(() => {
    const map = new Map();
    for (const nudge of crmNudges.nudges || []) {
      if (!TIP_RULE_IDS.has(nudge.ruleId)) continue;
      map.set(String(nudge.subject.id), nudge);
    }
    return map;
  }, [crmNudges.nudges]);
  const onNudgeEscape = React.useCallback(async (nudge, action, until) => {
    const res = await crmNudges.suppress(nudge, action, until);
    if (!res.ok) toast.error(`제안을 처리하지 못했어요 — ${res.reason || "다시 시도해 주세요"}`);
  }, [crmNudges, toast]);

  const today = new Date();
  const todayKey = localDateKey(today);

  const ledgerRows = React.useMemo(() => toRows(scopedLedger), [scopedLedger]);
  // 낙관 삭제된 행은 기록이 다시 로드돼도 계속 숨긴다 — 되돌리기 창이 닫히기 전에
  // 재조회가 끼어들면 지운 행이 깜빡이며 되살아난다.
  const allRows = React.useMemo(
    () => ledgerRows
      .filter(r => !deletedKeys.has(r.key))
      .map(r => ({
        ...r,
        ...(promiseOverrides[r.key] || {}),
        focusOverride: focusOverrides[r.key] ?? r.focusOverride,
      })),
    [ledgerRows, deletedKeys, focusOverrides, promiseOverrides],
  );

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

  // 소비한 쿼리만 지운다 — ?scope=는 남아야 목록 범위가 유지된다. 소비한 키는 누적한다:
  // ?q=와 ?customer=가 같은 틱에 소비되면 두 번째 replace가 낡은 searchParams로 첫 번째를 되살린다.
  const consumedParamsRef = React.useRef(new Set());
  const stripParams = React.useCallback((keys) => {
    keys.forEach((key) => consumedParamsRef.current.add(key));
    const next = new URLSearchParams(searchParams?.toString() || "");
    consumedParamsRef.current.forEach((key) => next.delete(key));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  // ?q=<검색어> — 오늘 연락 등 다른 탭이 "이 사람 찾기"로 보낸다. 전체에서 찾고 1회 소거.
  // ?new=customer — 탑바 생성·다른 탭의 "새 고객" 딥링크. 1회 열고 소거.
  const entryParamsDone = React.useRef(false);
  React.useEffect(() => {
    if (entryParamsDone.current) return;
    entryParamsDone.current = true;
    const q = searchParams?.get("q");
    const wantsNew = searchParams?.get("new");
    const consumed = [];
    if (q) { setSearch(q); setSegment("all"); consumed.push("q"); }
    if (wantsNew === "customer" || wantsNew === "lead") { setNewCustomer({ name: q || "" }); consumed.push("new"); }
    if (consumed.length) stripParams(consumed);
  }, [searchParams, stripParams]);

  // 딥링크: ?customer=<kind>:<id> — 기록 로드 후 1회만 열고 쿼리 소거 (DESIGN §8.1)
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
    stripParams(["customer"]);
  }, [allRows, searchParams, stripParams, syncState]);

  // 방금 만든 고객 — 기록을 다시 읽은 뒤 열린다. 새 기록에도 없으면 조용히 넘어가지 않는다.
  React.useEffect(() => {
    if (!pendingOpen || syncState === "loading" || ledger === pendingOpen.ledger) return;
    if (allRows.some(r => r.key === pendingOpen.key)) setOpenKey(pendingOpen.key);
    else setCreateError("새 고객을 목록에서 찾지 못했어요 — 범위(스코프)를 확인하거나 새로 고침해 보세요.");
    setPendingOpen(null);
  }, [pendingOpen, allRows, syncState, ledger]);

  const regionOptions = React.useMemo(() => customerRegionOptions(allRows), [allRows]);
  const genreOptions = React.useMemo(() => customerGenreOptions(allRows), [allRows]);
  const sourceOptions = React.useMemo(() => {
    const sources = [...new Set(allRows.map(r => r.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    return [{ value: "", label: "전체 유입" }, ...sources.map(s => ({ value: s, label: s }))];
  }, [allRows]);
  const activeFilterCount = [focusFilter, regionFilter, subjectFilter, genreFilter, sourceFilter].filter(Boolean).length;
  const clearFilters = () => { setFocusFilter(""); setRegionFilter(""); setSubjectFilter(""); setGenreFilter(""); setSourceFilter(""); };

  const term = search.trim();
  const filtered = React.useMemo(() => allRows.filter(r =>
    inCustomerSegment(r, segment) &&
    matchesCustomerFocus(r, focusFilter) &&
    matchesCustomerLabels(r, { region: regionFilter, subject: subjectFilter, genre: genreFilter }) &&
    (!sourceFilter || r.source === sourceFilter) &&
    matchesCustomerSearch(r, term)
  ), [allRows, segment, focusFilter, regionFilter, subjectFilter, genreFilter, sourceFilter, term]);

  // 정렬: 헤더 클릭 asc → desc → 해제 3단 (DESIGN §8.1). 해제 시 기록 순서.
  // 기본은 다음 약속 오름차순(날짜 없는 약속은 방향과 무관하게 뒤).
  const cycleSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };
  const sorted = React.useMemo(() => sortCustomers(filtered, sort, todayKey), [filtered, sort, todayKey]);

  // 빨강 예산 — 약속을 놓친 행 중 목록 순서로 앞의 몇 개만 레일을 받는다.
  const railKeys = React.useMemo(() => {
    const keys = new Set();
    for (const r of sorted) {
      if (keys.size >= MAX_DANGER_RAILS) break;
      if (customerPromise(r, todayKey).late > 0) keys.add(r.key);
    }
    return keys;
  }, [sorted, todayKey]);

  const counts = React.useMemo(() => customerSegmentCounts(allRows), [allRows]);
  const openWithoutPromise = React.useMemo(() => countOpenWithoutPromise(allRows, todayKey), [allRows, todayKey]);

  const openNewCustomer = React.useCallback((name = "") => setNewCustomer({ name }), []);

  // 검색: 치기 시작하면 전체에서 찾는다(목업 02). 지우면 기본 세그먼트로 돌아간다.
  const searchRef = React.useRef(null);
  const onSearchChange = (value) => {
    if (!search.trim() && value.trim()) setSegment("all");
    setSearch(value);
  };
  const clearSearch = () => { setSearch(""); setSegment(DEFAULT_CUSTOMER_SEGMENT); };

  // 키보드 계층: j/k·↑↓ 행 이동 · Enter/e 열기 · n 생성 · / 검색 · Esc 해제.
  const kbRows = React.useMemo(() => sorted.map(r => ({ id: r.key })), [sorted]);
  const selection = useCrmSelection(kbRows);
  const { moveSelection, setSelectedId, selectedId } = selection;
  useCrmKeyboard({
    selection,
    onNew: () => openNewCustomer(),
    onEditSelected: (key) => setOpenKey(key),
    onSearchFocus: () => searchRef.current?.focus(),
  });
  // useCrmKeyboard는 j/k만 안다 — 목업의 ↑↓와 선택 행 Enter를 같은 양보 규칙으로 더한다.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      if (document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]')) return;
      const el = document.activeElement;
      const onRow = el?.closest?.("[data-customer-row]");
      if (!(!el || el === document.body || onRow)) return;
      if (e.key === "Enter") {
        if (onRow || !selectedId) return; // 행 자신의 onKeyDown이 연다
        e.preventDefault();
        setOpenKey(selectedId);
        return;
      }
      e.preventDefault();
      moveSelection(e.key === "ArrowDown" ? "down" : "up");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveSelection, selectedId]);
  React.useEffect(() => {
    if (!selectedId) return;
    const node = document.querySelector(`[data-customer-row="${CSS.escape(selectedId)}"]`);
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
    const el = document.activeElement;
    if (!el || el === document.body || el.closest?.("[data-customer-row]")) node.focus({ preventScroll: true });
  }, [selectedId]);

  const onSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (search) clearSearch();
      else e.currentTarget.blur();
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "Enter") && sorted.length && !e.nativeEvent.isComposing) {
      e.preventDefault();
      setSelectedId(sorted[0].key);
      document.querySelector(`[data-customer-row="${CSS.escape(sorted[0].key)}"]`)?.focus();
    }
  };

  const openRow = allRows.find(r => r.key === openKey) || null;

  // 기록 저장 결과 — 폼이 닫힌 뒤에 도착할 수도 있어 페이지가 받는다.
  const onRecordPersisted = React.useCallback((row) => {
    toast.success(`기록됨 · ${customerDisplayName(row)}`);
    reloadLedger(); // 약속·마지막 연락이 새 기록을 반영하도록
  }, [toast, reloadLedger]);
  const onRecordFailed = React.useCallback((row, { message, form, formMounted }) => {
    toast.error(`기록하지 못했습니다 · ${customerDisplayName(row)} — ${message}`);
    if (formMounted) return;
    setOpenKey(row.key);
    setRecordRequest({ key: row.key, draft: form, error: message });
  }, [toast]);
  const onPromiseSaved = React.useCallback((row, patch) => {
    // 저장이 확인된 값을 바로 보이고, 기록을 다시 읽어 공유 캐시(다른 탭)도 맞춘다.
    setPromiseOverrides(prev => ({ ...prev, [row.key]: { ...(prev[row.key] || {}), ...patch } }));
    reloadLedger();
  }, [reloadLedger]);
  const onRecordRequestConsumed = React.useCallback(() => setRecordRequest(null), []);

  const showSkeleton = syncState === "loading" && ledgerRows.length === 0;
  const total = allRows.length;
  const searching = Boolean(term);
  const filtersActive = activeFilterCount > 0;

  let body;
  if (showSkeleton) {
    body = (
      <div className="customers-skeleton">
        <Skeleton lines={6} height={22} gap={18} label="고객 불러오는 중" />
      </div>
    );
  } else if (syncState === "error" && ledgerRows.length === 0) {
    body = <CustomersReadError onRetry={reloadLedger} />;
  } else if (syncState === "preview" && ledgerRows.length === 0) {
    body = (
      <div className="customers-state">
        <TruthBadge state="preview" reason="Supabase 연결 필요" />
        <p>저장소가 연결되면 고객이 여기에 나타나요. 예시 고객은 만들지 않습니다.</p>
      </div>
    );
  } else if (sorted.length === 0) {
    body = searching ? (
      <EmptyState
        icon="search"
        title={`'${term}'에 맞는 고객이 없어요`}
        description={filtersActive ? "필터가 켜져 있어요 — 필터를 풀면 더 찾을 수 있어요." : "이름·학원·전화번호 뒷자리로 찾아요."}
        action={(
          <div className="customers-empty-actions">
            <Button variant="outline" size="sm" onClick={clearSearch}>검색 지우기</Button>
            <Button variant="outline" size="sm" icon="plus" onClick={() => openNewCustomer(term)}>'{term}' 새 고객으로</Button>
          </div>
        )}
      />
    ) : total === 0 ? (
      <EmptyState
        icon="accounts"
        title="아직 고객이 없어요"
        description="첫 고객을 등록하면 여기에 나타나요."
        action={<Button variant="outline" size="sm" icon="plus" onClick={() => openNewCustomer()}>고객 등록</Button>}
      />
    ) : (
      <EmptyState
        icon="accounts"
        title={filtersActive ? "조건에 맞는 고객이 없어요" : `${CUSTOMER_SEGMENTS.find(s => s.key === segment)?.label || ""} 고객이 없어요`}
        description={filtersActive ? "필터를 풀거나 다른 구분을 골라 보세요." : "다른 구분을 고르거나 전체를 보세요."}
        action={filtersActive
          ? <Button variant="outline" size="sm" onClick={clearFilters}>필터 해제</Button>
          : <Button variant="outline" size="sm" onClick={() => setSegment("all")}>전체 보기</Button>}
      />
    );
  } else {
    body = sorted.map(r => (
      <CustomerRow
        key={r.key}
        row={r}
        today={todayKey}
        selected={selectedId === r.key}
        rail={railKeys.has(r.key)}
        nudge={nudgesBySubjectId.get(String(r.id))}
        onOpen={setOpenKey}
        onSelect={setSelectedId}
      />
    ));
  }

  return (
    <div className="hub-futura hub-page fade-up customers-page">
      <header className="customers-hero">
        <div className="fx-head">
          <div>
            <p className="fx-eyebrow customers-hero__eyebrow">
              {scopeKey && <>{SCOPE_LABEL[scopeKey]} · </>}
              고객 <span className="num">{total}</span>명 · 약속 없는 진행 중 <span className="num">{openWithoutPromise}</span>
              {(syncState === "partial" || syncState === "preview" || (syncState === "error" && ledgerRows.length > 0)) && (
                <TruthBadge state={syncState === "error" ? "partial" : syncState} reason={syncState === "error" ? "다시 읽기 실패 · 이전 기록 표시 중" : undefined} style={{ marginLeft: 8 }} />
              )}
              {syncState === "loading" && ledgerRows.length > 0 && <TruthBadge state="syncing" style={{ marginLeft: 8 }} />}
            </p>
            <h2 className="fx-page-title">누구를 찾으세요?</h2>
            {createError && <p role="alert" className="customers-hero__alert">{createError}</p>}
          </div>
          <Button variant="primary" size="md" icon="plus" onClick={() => openNewCustomer()}>고객 <Kbd>N</Kbd></Button>
        </div>

        <label className="hub-field customers-search">
          <span className="customers-search__icon" aria-hidden="true"><Iconed name="search" size={17} /></span>
          <input
            ref={searchRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="이름 · 학원 · 전화번호 뒷자리"
            aria-label="고객 검색"
          />
          {search && <IconButton icon="x" size={32} iconSize={13} tooltip="검색 지우기" onClick={clearSearch} />}
          <span className="customers-search__kbd" aria-hidden="true"><Kbd>/</Kbd></span>
        </label>
      </header>

      <section className="customers-list" aria-label="고객 목록">
        <div className="customers-toolbar">
          <SegmentedControl
            label="고객 구분"
            className="customers-seg"
            options={CUSTOMER_SEGMENTS.map(s => ({ key: s.key, label: s.label, count: counts[s.key] }))}
            value={segment}
            onChange={setSegment}
          />
          <Button variant="ghost" size="sm" icon="filter" aria-expanded={filtersOpen} aria-controls="customers-filters" onClick={() => setFiltersOpen(o => !o)}>
            필터{activeFilterCount ? <span className="num"> {activeFilterCount}</span> : null}
          </Button>
          <span className="customers-toolbar__hint">↑↓ 이동 · ↵ 열기 · / 검색</span>
        </div>

        {filtersOpen && (
          <div id="customers-filters" className="customer-label-filters customers-filters" role="group" aria-label="고객 보조 필터">
            <SelectField label="표시" value={focusFilter} onChange={(event) => setFocusFilter(event.target.value)} options={CUSTOMER_FOCUS_FILTERS} />
            <SelectField label="과목" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} options={[
              { value: "", label: "전체 과목" },
              { value: CUSTOMER_LABEL_MISSING, label: "과목 미입력" },
              ...LEAD_SUBJECTS.map((subject) => ({ value: subject.key, label: subject.label })),
            ]} />
            <SelectField label="지역" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} options={regionOptions} />
            <SelectField label="장르" value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)} options={genreOptions} />
            <SelectField label="유입" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} options={sourceOptions} />
            {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>필터 해제</Button>}
          </div>
        )}

        <div className="fx-card customers-table">
          <div className="customers-grid customers-head">
            <SortHead k="name" sort={sort} onToggle={cycleSort}>고객</SortHead>
            <SortHead k="phase" sort={sort} onToggle={cycleSort}>단계</SortHead>
            <SortHead k="promise" sort={sort} onToggle={cycleSort}>다음 약속</SortHead>
            <SortHead k="last" sort={sort} onToggle={cycleSort}>마지막 연락</SortHead>
            <SortHead k="value" sort={sort} onToggle={cycleSort} align="right">금액</SortHead>
          </div>
          <div className="customers-rows">{body}</div>
          {sorted.length > 0 && (
            <div className="customers-foot">
              <span><span className="num">{sorted.length}</span>명 표시</span>
              <span>정렬: {sortCaption(sort)}</span>
            </div>
          )}
        </div>
      </section>

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
          today={todayKey}
          recordRequest={recordRequest}
          onRecordRequestConsumed={onRecordRequestConsumed}
          onClose={() => setOpenKey(null)}
          onNavigate={onNavigate}
          onDelete={deleteCustomer}
          onFocusChange={(key, val) => setFocusOverrides(prev => ({ ...prev, [key]: val }))}
          onLabelsSaved={reloadLedger}
          onPromiseSaved={onPromiseSaved}
          onRecordPersisted={onRecordPersisted}
          onRecordFailed={onRecordFailed}
          nudge={nudgesBySubjectId.get(String(openRow.id))}
          onNudgeEscape={onNudgeEscape}
        />
      )}

      {newCustomer && (
        <NewCustomerDrawer
          initialName={newCustomer.name}
          workspace={scopeKey === "classin" ? "classin" : null}
          onClose={() => setNewCustomer(null)}
          onCreated={(id, name) => {
            toast.success(`고객 등록됨 · ${name}`);
            setPendingOpen({ key: `lead:${id}`, ledger });
            reloadLedger();
          }}
        />
      )}
    </div>
  );
}
