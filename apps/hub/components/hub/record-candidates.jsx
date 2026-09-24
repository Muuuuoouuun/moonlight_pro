"use client";

// "기록할까요" — 입력을 잊는 가장 흔한 순간(미팅이 끝난 뒤·통화를 끊은 직후)을 잡아 기록을 권한다.
//
// 후보는 두 곳에서 온다: 캘린더(고객과 맞는 지난 일정인데 기록이 없다)와 갤럭시(Engine이 고객과 맞춘
// 통화·문자·카톡). 자동 저장은 없다 — [기록 남기기]는 호출처의 기록 시트를 여는 것까지만 한다.
//
// 호출처 계약(오늘 연락):
//   <RecordCandidates onRecord={(candidate) => 시트 열기} onNavigate={go} />
//   기록이 서버에 저장된 뒤(persisted) `resolveRecordCandidate(candidate.id)`를 부른다 — 폰 후보는
//   processed로 닫히고, 이 섹션은 이벤트를 받아 다시 읽는다. 캘린더 후보는 기록이 생기면 저절로 빠진다.
//
// 색은 쓰지 않는다. 출처는 글리프 + 직접 라벨, 상태는 TruthBadge(§5.3).

import React from "react";
import { Button, Card, SectionTitle, Skeleton, TruthBadge, useToast } from "./hub-primitives";
import { describeCandidate } from "@/lib/sales-os/record-candidates";

const ENDPOINT = "/api/hub/record-candidates";
const CHANGED_EVENT = "mlp:record-candidates-changed";
// 탭으로 돌아왔을 때 다시 읽는 최소 간격 — 폰에서 방금 온 후보를 새로고침 없이 본다.
const REFOCUS_RELOAD_MS = 30000;

const GLYPH = { meeting: "◷", call: "☏", sms: "✉", kakao: "▢" };
const GLYPH_LABEL = { meeting: "캘린더 일정", call: "통화", sms: "문자", kakao: "카톡" };
const OK_STATUSES = new Set(["saved", "duplicate", "accepted"]);
const DISMISS_RECEIPT = {
  discard: "버렸어요",
  cancelled: "취소·노쇼로 정리했어요",
  "not-this-customer": "이 고객 일정이 아니라고 표시했어요",
};

// 저장 봉투를 { ok, status, message }로 접는다. preview는 저장되지 않았다는 뜻이다(ok: false).
export async function postRecordCandidateAction(id, action, reason) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reason ? { id, action, reason } : { id, action }),
    });
    const data = await res.json().catch(() => ({}));
    const status = typeof data?.status === "string" ? data.status : res.ok ? "unknown" : "failed";
    const ok = OK_STATUSES.has(status);
    const message = status === "preview"
      ? "Preview · 연결 필요 — 저장되지 않았어요"
      : data?.message || (ok ? "" : "저장을 확인하지 못했어요");
    return { ok, status, ...(message ? { message } : {}) };
  } catch (err) {
    return { ok: false, status: "failed", message: err instanceof Error ? err.message : String(err) };
  }
}

// 기록 저장이 확인된 뒤에 부른다. 성공하면 열려 있는 "기록할까요" 섹션이 그 후보를 내리고 다시 읽는다.
export async function resolveRecordCandidate(id) {
  const result = await postRecordCandidateAction(id, "resolve");
  if (result.ok && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { id } }));
  }
  return { ok: result.ok, status: result.status, ...(result.message ? { message: result.message } : {}) };
}

function normalizeRead(d) {
  const status = ["live", "partial", "preview", "error"].includes(d?.status) ? d.status : "error";
  return {
    status,
    candidates: Array.isArray(d?.candidates) ? d.candidates : [],
    discardedToday: Number.isFinite(d?.discardedToday) ? d.discardedToday : 0,
    message: typeof d?.message === "string" ? d.message : "",
  };
}

export function useRecordCandidates() {
  const [state, setState] = React.useState({ status: "loading", candidates: [], discardedToday: 0, message: "" });
  const [version, reload] = React.useReducer((v) => v + 1, 0);
  const lastLoad = React.useRef(0);

  React.useEffect(() => {
    let active = true;
    lastLoad.current = Date.now();
    fetch(ENDPOINT, { cache: "no-store" })
      .then((r) => r.json())
      // 허브 read 계약: 실패도 HTTP 200 + status:"error"다 — !r.ok만 보면 "후보 없음"으로 위장된다.
      .then((d) => { if (active) setState(normalizeRead(d)); })
      .catch(() => { if (active) setState({ status: "error", candidates: [], discardedToday: 0, message: "기록 후보를 불러오지 못했어요." }); });
    return () => { active = false; };
  }, [version]);

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > REFOCUS_RELOAD_MS) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return { ...state, reload };
}

function customerHref(candidate) {
  const key = candidate?.customer?.key;
  return key ? `dashboard/revenue/customers?customer=${encodeURIComponent(key)}` : null;
}

function CandidateRow({ candidate, now, busy, onRecord, onNavigate, onDismiss }) {
  const line = describeCandidate(candidate, now);
  const glyphKey = candidate.source === "calendar" ? "meeting" : candidate.channel;
  const href = customerHref(candidate);
  const promise = candidate.source === "phone" && candidate.promiseHint;
  const nameNode = href && onNavigate ? (
    <a
      href={`/${href}`}
      onClick={(e) => { e.preventDefault(); onNavigate(href); }}
      style={{ color: "inherit", fontWeight: 600, textDecorationLine: "underline", textDecorationColor: "var(--line)", textUnderlineOffset: 3 }}
    >
      {line.name}
    </a>
  ) : <b style={{ fontWeight: 600 }}>{line.name}</b>;

  return (
    <div className="hub-row" data-candidate={candidate.id} style={{ display: "flex", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--line-soft)" }}>
      <span
        role="img"
        aria-label={GLYPH_LABEL[glyphKey] || "연락"}
        style={{
          flex: "0 0 28px", height: 28, borderRadius: "var(--r-sm)", background: "var(--surface-2)",
          display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 13,
        }}
      >
        {GLYPH[glyphKey] || "·"}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.45 }}>
            <span className="num" style={{ color: "var(--fg-muted)" }}>{line.when}</span>{" "}
            {nameNode}{line.tail}
          </div>
          {line.quote && (
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4, paddingLeft: 10, borderLeft: "1px solid var(--line)", overflowWrap: "anywhere" }}>
              {line.quote}
            </div>
          )}
          {line.meta && <div style={{ fontSize: 11.5, color: "var(--fg-dim)", marginTop: 3 }}>{line.meta}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Button variant="outline" size="sm" icon={promise ? "calendar" : "edit"} disabled={busy} onClick={() => onRecord?.(candidate)}>
            {promise ? "약속으로" : "기록 남기기"}
          </Button>
          {candidate.source === "calendar" ? (
            <>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => onDismiss(candidate, "cancelled")}>취소·노쇼</Button>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => onDismiss(candidate, "not-this-customer")}>고객 아님</Button>
            </>
          ) : (
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => onDismiss(candidate, "discard")}>버림</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 표시만 한다(테스트가 상태별로 그린다). 읽기·쓰기는 RecordCandidates가 한다.
export function RecordCandidatesView({
  status = "loading",
  candidates = [],
  discardedToday = 0,
  message = "",
  busyId = null,
  now = Date.now(),
  onRecord,
  onNavigate,
  onDismiss = () => {},
  onRetry,
}) {
  const readable = status === "live" || status === "partial";
  // 확인된 0건만 숨긴다 — 실패·일부·미연결을 "없음"으로 보이게 하지 않는다.
  if (status === "live" && candidates.length === 0) return null;

  return (
    <section aria-label="기록할까요" aria-busy={status === "loading" ? "true" : undefined}>
      <SectionTitle
        style={{ marginBottom: 8 }}
        right={(
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--fg-dim)" }}>
            {status === "partial" && <TruthBadge state="partial" />}
            캘린더 · 갤럭시
          </span>
        )}
      >
        기록할까요
        {readable && (
          <span className="num" style={{ marginLeft: 8, letterSpacing: 0, color: "var(--fg-muted)" }}>{candidates.length}</span>
        )}
      </SectionTitle>
      <Card pad={false} style={{ overflow: "hidden" }}>
        {status === "loading" && (
          <div style={{ padding: "14px 16px" }}>
            <Skeleton lines={2} height={12} label="기록 후보 불러오는 중" />
          </div>
        )}
        {status === "error" && (
          <div role="alert" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <TruthBadge state="error" reason="기록 후보" />
            <span style={{ fontSize: 12.5, color: "var(--fg-muted)", flex: "1 1 220px" }}>
              {message || "기록 후보를 불러오지 못했어요."} 지금 비어 보여도 실제로는 있을 수 있어요.
            </span>
            {onRetry && <Button variant="outline" size="xs" icon="runs" onClick={onRetry}>다시 불러오기</Button>}
          </div>
        )}
        {status === "preview" && (
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <TruthBadge state="preview" />
            <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
              Supabase를 연결하면 캘린더 미기록 미팅과 갤럭시 통화·문자·카톡이 여기 모여요.
            </span>
          </div>
        )}
        {status === "partial" && message && (
          <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--fg-muted)" }}>{message}</div>
        )}
        {readable && candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            now={now}
            busy={busyId === candidate.id}
            onRecord={onRecord}
            onNavigate={onNavigate}
            onDismiss={onDismiss}
          />
        ))}
        {readable && discardedToday > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line-soft)", fontSize: 11.5, color: "var(--fg-dim)" }}>
            <span aria-hidden="true">⊘ </span>
            고객이 아닌 연락 <span className="num">{discardedToday}</span>건은 오늘 내용 없이 버렸어요
          </div>
        )}
      </Card>
    </section>
  );
}

export function RecordCandidates({ onRecord, onNavigate }) {
  const toast = useToast();
  const data = useRecordCandidates();
  const [hidden, setHidden] = React.useState(() => new Set());
  const [busyId, setBusyId] = React.useState(null);
  const { reload } = data;

  const hide = React.useCallback((id, on) => setHidden((prev) => {
    const next = new Set(prev);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }), []);

  // 기록 저장 뒤 호출처가 resolveRecordCandidate를 부르면 그 후보를 내리고 다시 읽는다.
  React.useEffect(() => {
    const onChanged = (event) => {
      if (event?.detail?.id) hide(event.detail.id, true);
      reload();
    };
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, [hide, reload]);

  const restore = React.useCallback(async (candidate, who) => {
    const result = await postRecordCandidateAction(candidate.id, "restore");
    if (!result.ok) {
      toast.error(`되돌리지 못했어요 · ${who} — ${result.message || "다시 시도해 주세요"}`);
      return;
    }
    hide(candidate.id, false);
    reload();
  }, [hide, reload, toast]);

  // 낙관적으로 내리고, 서버가 저장을 확인한 뒤에만 되돌리기 토스트를 띄운다. 실패하면 행을 되살린다.
  const dismiss = React.useCallback(async (candidate, reason) => {
    const who = candidate.customer?.person || candidate.customer?.name || "후보";
    hide(candidate.id, true);
    setBusyId(candidate.id);
    const result = await postRecordCandidateAction(candidate.id, "dismiss", reason === "discard" ? undefined : reason);
    setBusyId(null);
    if (!result.ok) {
      hide(candidate.id, false);
      toast.error(`정리하지 못했어요 · ${who} — ${result.message || "다시 시도해 주세요"}`);
      return;
    }
    toast(`${DISMISS_RECEIPT[reason] || "정리했어요"} · ${who}`, {
      action: { label: "되돌리기", onClick: () => { void restore(candidate, who); } },
    });
  }, [hide, restore, toast]);

  const visible = data.candidates.filter((candidate) => !hidden.has(candidate.id));
  return (
    <RecordCandidatesView
      status={data.status}
      candidates={visible}
      discardedToday={data.discardedToday}
      message={data.message}
      busyId={busyId}
      onRecord={onRecord}
      onNavigate={onNavigate}
      onDismiss={dismiss}
      onRetry={reload}
    />
  );
}
