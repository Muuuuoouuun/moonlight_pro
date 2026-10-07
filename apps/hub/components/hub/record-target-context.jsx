"use client";

// 오늘 연락에서 연 넓은 기록창의 읽기 칸(2026-09-30 넓은 기록창 ④ · Q-CR2, 권장 · 화면 확인 뒤 확정).
//
// 고객 드로어는 읽던 것을 그대로 옆에 남긴다. 오늘 연락은 행에서 곧바로 창을 열어 읽어 둔 것이 없으므로
// 이 칸이 고른 고객의 최근 기록을 직접 읽는다 — 고객 드로어와 같은 길(`/api/hub/revenue/activity`, 회사 우선
// 조인 · 연결 메모는 `useMemoSearch`)이고 새 읽기 라우트를 만들지 않는다. 약속은 호출처가 목록에서 이미 아는
// 것을 준다(목록에 없는 고객이면 null — 모른다고 말한다).
//
// 읽기만 한다. 읽는 동안은 Skeleton, 못 읽었으면 그렇게 말하고(recordContextTruth), 어느 경우에도 쓰기를
// 막지 않는다 — 쓰기 칸은 이 칸과 따로 서 있다. 고객이 바뀌면 호출처가 key로 새로 세운다(앞 사람의 기록이
// 잠깐 남아 보이지 않게).
//
// contact-record-form.jsx는 이 파일을 import하지 않는다: 읽기 칸을 쓰지 않는 호출처(거래 독 · 첫 화면 ·
// 에이전트)가 메모 읽기 코드를 끌고 오지 않게 호출처(오늘 연락)가 이 칸을 세워 넘긴다.

import React from "react";
import { RecordContextColumn } from "./record-context-column";
import { useMemoSearch } from "./pages/use-memo-search";
import { isCanonicalUuid } from "@/lib/uuid";
import { memoStreamRows, recordActivityQuery, recordContextTruth, recordStream } from "@/lib/sales-os/record-context";

// 이 고객의 활동을 한 번 읽는다 → { sync: "live" | "preview" | "error", activities }. 읽기 실패를 빈 목록으로
// 돌려주지 않는다: 5xx · 허브 read 봉투의 status:"error" · 네트워크 실패는 전부 error다(§5.3 — "기록 없음"이
// 아니라 "못 읽음"). 저장된 고객이 아니면(질의 없음) 읽지 않는다.
export async function readTargetActivities(query, fetchImpl = fetch) {
  if (!query) return { sync: "preview", activities: [] };
  try {
    const response = await fetchImpl(`/api/hub/revenue/activity?${query}`, { cache: "no-store" });
    if (!response.ok) return { sync: "error", activities: [] };
    const data = await response.json();
    if (!data || data.status === "error") return { sync: "error", activities: [] };
    return { sync: data.status === "live" ? "live" : "preview", activities: Array.isArray(data.activities) ? data.activities : [] };
  } catch {
    return { sync: "error", activities: [] };
  }
}

// → { activities, sync: "loading" | "live" | "preview" | "error", reload }
function useTargetActivities(target) {
  const query = recordActivityQuery(target);
  const [state, setState] = React.useState({ sync: "loading", activities: [] });
  const requestRef = React.useRef(0);

  const load = React.useCallback(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setState((prev) => ({ ...prev, sync: "loading" }));
    // 늦게 온 앞 요청의 답이 새 읽기를 덮지 않게 한다.
    readTargetActivities(query).then((next) => { if (requestRef.current === requestId) setState(next); });
  }, [query]);

  React.useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  return { ...state, reload: load };
}

// target: { kind, id, companyId?, name }. promise: 읽기 칸의 약속(customerPromise 모양) | null(모름).
// tipReason: 이 사람에게 이미 고른 제안 팁의 이유. today: 기록 시각 글자의 기준일.
export function RecordTargetContext({ target, promise = null, tipReason = "", today }) {
  const { activities, sync, reload } = useTargetActivities(target);
  // 연결 메모는 리드 · 계약 고객에만 붙는다(일지 메모 문맥은 uuid) — 고객 드로어와 같은 조회.
  const memoEnabled = (target?.kind === "lead" || target?.kind === "account") && isCanonicalUuid(target?.id);
  const memoQuery = memoEnabled
    ? `${new URLSearchParams({ contextType: target.kind, contextId: String(target.id).toLowerCase() })}&limit=3`
    : "";
  const memos = useMemoSearch(memoQuery, { enabled: memoEnabled });
  const rows = React.useMemo(
    () => recordStream(activities, memoEnabled && memos.status === "live" ? memoStreamRows(memos.entries) : []),
    [activities, memoEnabled, memos.status, memos.entries],
  );

  return (
    <RecordContextColumn
      name={target?.name || ""}
      promise={promise}
      tipReason={tipReason}
      rows={rows}
      today={today}
      truth={recordContextTruth({ actSync: sync, memoEnabled, memoStatus: memos.status })}
      onRetry={(which) => (which === "memos" ? memos.refresh() : reload())}
      // 이 창에는 '고객 정보로'가 없다 — 전체 기록은 고객 탭의 드로어에서 본다.
      elsewhere="고객 탭"
    />
  );
}
