"use client";

// CRM 넛지 — 데이터 계층. 판정은 lib/sales-os/crm-nudges.js(순수 함수)가 하고, 이 파일은
// 그 결과를 읽고(useCrmNudges) 억제(숨기기·미루기)를 쓰는 React 훅 + 어떤 규칙을 화면에
// 팁으로 되살릴지 정하는 얇은 매핑만 가진다.
//
// 2026-09-24 영업·매출 라운드 2 — 운영자 결정: "내가 생각한 넛지는 디자인 요소나 아니면
// 추천 팁 혹은 제안 같은 쪽으로 가야 돼." 이전 버전의 CrmNudgeCard/CrmNudgeSection(전용
// 섹션·카드 목록)은 그 결정과 반대라서 걷어냈다 — 넛지는 이제 대상(행·드로어)에 붙는
// SuggestionTip(./suggestion-tip.jsx) 한 줄이고, 호출부(customers.jsx·followups.jsx)가
// useCrmNudges()로 읽은 뒤 자기 행에 직접 붙인다.

import React from "react";

// 팁으로 되살릴 규칙만 허용한다. 나머지는 이미 다른 화면 요소가 같은 사실을 말하고 있어서
// 다시 팁으로 얹으면 "대상 하나당 팁 하나" 예산을 넘기고 중복이 된다:
//   · meeting_unrecorded — 오늘 연락의 "기록할까요"(RecordCandidates)가 이미 같은 계기를 보여준다.
//   · promise_missed / promise_due — 오늘 연락의 "놓친 약속"·"오늘 약속" 행 자체, 그리고 고객
//     목록·드로어의 "N일 지남" 약속 표시 자체가 이미 그 사실이다. 같은 행에 팁을 또 붙이면
//     같은 말을 두 번 한다.
//   · no_next_action — 고객 목록·드로어의 "다음 약속 없음" 카드가 이미 CTA를 낸다. 문구가
//     이관·시트 템플릿뿐인 경우는 customer-list.js의 customerPromise() state:"template"과
//     그 문구를 그대로 보여주는 전용 제안(고객 화면)이 대신한다 — 여기서 다시 얹지 않는다.
export const TIP_RULE_IDS = new Set(["reaction_open", "dormant_recheck"]);

// 팁 한 줄 문구 — 무엇이 계기인지(title) + 근거(reason)를 한 줄로 묶는다.
export function nudgeTipReason(nudge) {
  if (!nudge) return "";
  return nudge.reason ? `${nudge.title} · ${nudge.reason}` : nudge.title;
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
