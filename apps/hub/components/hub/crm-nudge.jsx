"use client";

// CRM 넛지 카드 — 계기 하나에 이유 한 줄, 행동 하나, 탈출구.
//
// 기회 탐색 넛지(discovery-nudge.jsx)와 같은 계약을 고객 축으로 옮긴 것이다. 차이는
// 상태 저장 위치뿐: 기회는 전용 테이블(discovery_nudge_states), 고객은 대상 레코드의
// meta.nudges(마이그레이션 0).
//
// 색은 쓰지 않는다. severity는 배치(어느 섹션에 뜨는가)로 말하고, 카드 자체는 중립이다 —
// 긴급은 §5.3 빨강 예산 안에서 목록이 이미 레일로 표현한다.

import React from "react";
import { Button, Kbd, TextField } from "./hub-primitives";
import { Iconed } from "./hub-icons";

const ESCAPE_LABEL = {
  snooze: "미루기",
  dismiss: "이 제안 숨기기",
  cancelled: "취소·노쇼",
  "not-a-customer": "고객 아님",
};

export function CrmNudgeCard({ nudge, busy = false, onAct, onEscape }) {
  const [choosingDate, setChoosingDate] = React.useState(false);
  const [until, setUntil] = React.useState("");

  if (!nudge) return null;

  const escapes = Array.isArray(nudge.escape) ? nudge.escape : [];

  return (
    <div
      className="hub-row"
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: "12px 16px", borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nudge.subject?.name}</span>
        <span style={{ fontSize: 12.5, color: "var(--fg)" }}>{nudge.title}</span>
      </div>

      {/* 왜 지금인가 — 근거 한 줄. 이게 없으면 넛지가 아니라 잔소리다. */}
      <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{nudge.reason}</div>

      {choosingDate ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexWrap: "wrap" }}>
          <TextField
            label="다시 볼 날짜"
            type="date"
            className="mono"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            fieldStyle={{ flex: "0 1 170px" }}
          />
          <Button variant="outline" size="xs" disabled={!until || busy} onClick={() => { onEscape?.(nudge, "snooze", until); setChoosingDate(false); }}>
            그때 다시
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setChoosingDate(false)}>취소</Button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Button variant="outline" size="xs" icon="edit" disabled={busy} onClick={() => onAct?.(nudge)}>
            {nudge.action?.label || "기록 남기기"}
          </Button>
          {escapes.map((escape) => (
            <Button
              key={escape}
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => (escape === "snooze" ? setChoosingDate(true) : onEscape?.(nudge, escape))}
            >
              {ESCAPE_LABEL[escape] || escape}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// 섹션 껍데기 — 제목·건수·읽기 상태. 넛지가 없으면 아무것도 그리지 않는다
// (빈 섹션은 "할 일이 없다"를 말하는 게 아니라 자리만 먹는다).
export function CrmNudgeSection({ title, hint, nudges = [], state = "live", busyKey, onAct, onEscape }) {
  if (state === "live" && nudges.length === 0) return null;

  return (
    <section aria-label={title}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
        padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", background: "var(--surface-2)",
      }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-dim)" }}>
          {title}
        </h3>
        <span className="num" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{nudges.length}</span>
        {hint && <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>{hint}</span>}
      </div>
      {state === "error" ? (
        <div role="alert" style={{ padding: "12px 16px", fontSize: 12, color: "var(--danger)" }}>
          넛지를 불러오지 못했습니다 — 지금 비어 보여도 실제로는 있을 수 있습니다.
        </div>
      ) : (
        nudges.map((nudge) => (
          <CrmNudgeCard
            key={`${nudge.subject.type}-${nudge.subject.id}-${nudge.triggerKey}`}
            nudge={nudge}
            busy={busyKey === nudge.triggerKey}
            onAct={onAct}
            onEscape={onEscape}
          />
        ))
      )}
    </section>
  );
}

// 넛지 읽기 + 억제 쓰기. 억제 뒤에는 다시 읽어 "숨겼는데 그대로 있다"를 만들지 않는다.
export function useCrmNudges() {
  const [state, setState] = React.useState({ status: "loading", nudges: [], unrecordedMeetings: [], failedSources: [] });
  const [busyKey, setBusyKey] = React.useState(null);
  const [version, refresh] = React.useReducer((v) => v + 1, 0);

  React.useEffect(() => {
    let active = true;
    const ignored = readIgnoredEvents();
    const qs = ignored.length ? `?ignoredEvents=${encodeURIComponent(ignored.join(","))}` : "";
    fetch(`/api/hub/crm-nudges${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        // 허브 read 계약: 실패도 HTTP 200 + status:"error"다 — !r.ok만 보면 위장된다.
        setState({
          status: d?.status === "live" || d?.status === "partial" ? d.status : d?.status === "preview" ? "preview" : "error",
          nudges: Array.isArray(d?.nudges) ? d.nudges : [],
          unrecordedMeetings: Array.isArray(d?.unrecordedMeetings) ? d.unrecordedMeetings : [],
          failedSources: Array.isArray(d?.failedSources) ? d.failedSources : [],
        });
      })
      .catch(() => { if (active) setState({ status: "error", nudges: [], unrecordedMeetings: [], failedSources: [] }); });
    return () => { active = false; };
  }, [version]);

  const suppress = React.useCallback(async (nudge, action, until) => {
    // "고객 아님"은 저장소에 쓸 사실이 아니다 — 그 일정이 내 고객이 아니라는 이 브라우저의
    // 보기 설정이다(my-work-mute와 같은 계층).
    if (action === "not-a-customer") {
      ignoreEvent(nudge.meta?.eventId);
      refresh();
      return { ok: true };
    }
    setBusyKey(nudge.triggerKey);
    try {
      const res = await fetch("/api/hub/crm-nudges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectType: nudge.subject.type,
          subjectId: nudge.subject.id,
          triggerKey: nudge.triggerKey,
          action: action === "cancelled" ? "dismiss" : action,
          until,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== "saved") return { ok: false, reason: data.detail || data.reason || data.status };
      refresh();
      return { ok: true };
    } catch (err) {
      // 네트워크 실패도 결과로 돌려준다 — 거부된 promise를 호출처가 버리면 실패가 조용해진다.
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setBusyKey(null);
    }
  }, []);

  return { ...state, busyKey, suppress, refresh };
}

// 매칭이 틀린 일정은 저장소가 아니라 이 브라우저에만 기록한다.
const IGNORE_KEY = "mlp.crm.nudge-ignored-events";
const IGNORE_LIMIT = 200;

function readIgnoredEvents() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(IGNORE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function ignoreEvent(eventId) {
  if (!eventId) return;
  try {
    const next = [...new Set([...readIgnoredEvents(), String(eventId)])].slice(-IGNORE_LIMIT);
    window.localStorage.setItem(IGNORE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 못 해도 화면은 동작한다 — 다음 로드에 다시 뜰 뿐이다. */
  }
}
