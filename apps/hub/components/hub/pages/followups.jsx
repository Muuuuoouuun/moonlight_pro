"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Card, Button, Badge, Dot, SectionTitle, EmptyState, SyncBadge } from "../hub-primitives";
import { QUICK_LOG_ACTIONS as LOG_ACTIONS } from "@/lib/sales-os/outcome-attribution";

const STAGE_TONE = { new: "neutral", qualified: "info", nurturing: "moon", proposal: "moon", negotiation: "warning", prospect: "neutral" };
const CHANNEL_ICON = { "전화/문자": "chat", "방문": "building", "카톡": "chat" };

export function Followups() {
  const [state, setState] = React.useState({ syncState: "loading", items: [], summary: {}, error: null });
  const [logging, setLogging] = React.useState(null); // `${id}:${action}` in-flight
  const [logged, setLogged] = React.useState({}); // id → action label
  const [logErrors, setLogErrors] = React.useState({}); // id → durable write error
  const loadRequestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setState({ syncState: "loading", items: [], summary: {}, error: null });
    try {
      const response = await fetch("/api/hub/followups", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (loadRequestRef.current !== requestId) return;
      if (!response.ok || !data || data.status === "error") {
        setState({
          syncState: "error",
          items: [],
          summary: {},
          error: data?.error || data?.message || `팔로업 요청 실패 (${response.status})`,
        });
        return;
      }
      setState({
        syncState: data.status === "live" ? "live" : "preview",
        items: data.status === "live" && Array.isArray(data.items) ? data.items : [],
        summary: data.status === "live" ? data.summary || {} : {},
        error: null,
      });
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;
      setState({
        syncState: "error",
        items: [],
        summary: {},
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  React.useEffect(() => {
    load();
    return () => { loadRequestRef.current += 1; };
  }, [load]);

  const logOutcome = async (item, action, label) => {
    setLogging(`${item.id}:${action}`);
    setLogErrors((errors) => ({ ...errors, [item.id]: null }));
    try {
      const response = await fetch("/api/integrations/outcomes/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: item.kind === "lead" ? item.id : null,
          dealId: item.kind === "deal" ? item.id : null,
          channel: item.channel,
          action,
          play: "followup",
          note: `${item.name} · ${item.why}`,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!(response.ok && data?.status === "saved")) {
        setLogErrors((errors) => ({
          ...errors,
          [item.id]: data?.error || data?.message || data?.reason || `결과 기록 실패 (${response.status})`,
        }));
        return;
      }
      setLogged((m) => ({ ...m, [item.id]: label }));
    } catch (error) {
      setLogErrors((errors) => ({
        ...errors,
        [item.id]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setLogging(null);
    }
  };

  const { syncState, items, summary, error } = state;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1100 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center" }}>
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
        <Button variant="ghost" size="sm" icon="runs" onClick={load} disabled={syncState === "loading"}>새로고침</Button>
      </div>

      <Card pad={false} className="hub-table-card">
        {syncState === "loading" ? (
          <EmptyState
            icon="rhythm"
            title="팔로업 원장 확인 중"
            description="오늘 연락할 실제 리드와 딜을 확인하고 있습니다."
          />
        ) : syncState === "error" ? (
          <div role="alert">
            <EmptyState
              icon="signal"
              title="팔로업 원장을 불러오지 못했습니다"
              description={error || "실패한 읽기에서는 이전 팔로업과 결과 버튼을 표시하지 않습니다."}
              action={<Button variant="outline" size="sm" onClick={load}>다시 시도</Button>}
            />
          </div>
        ) : syncState === "preview" ? (
          <EmptyState
            icon="rhythm"
            title="팔로업 원장 연결 필요"
            description="Supabase 리드·딜 원장을 연결하면 오늘의 팔로업이 표시됩니다."
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="rhythm"
            title="오늘 챙길 팔로업이 없습니다"
            description="연결된 원장에 정체된 리드·딜이 생기면 여기에 우선순위로 뜹니다."
          />
        ) : (
          items.map((item, i) => (
            <div
              key={`${item.kind}-${item.id}`}
              style={{
                display: "flex", flexDirection: "column", gap: 8,
                padding: "12px 16px",
                borderBottom: i < items.length - 1 ? "1px solid var(--line-soft)" : "none",
                opacity: logged[item.id] ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Iconed name={CHANNEL_ICON[item.channel] || "chat"} size={14} style={{ color: "var(--moon-300)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{item.name}</span>
                {item.company && item.company !== item.name && (
                  <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>· {item.company}</span>
                )}
                <Badge tone={STAGE_TONE[item.stage] || "neutral"} size="xs">{item.stage}</Badge>
                <Badge tone="moon" size="xs">{item.channel}</Badge>
                <div style={{ flex: 1 }} />
                {item.phone && <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{item.phone}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                <span style={{ color: "var(--fg-muted)" }}>{item.why}</span>
                <span style={{ color: "var(--fg-faint)" }}>→ {item.nextAction}</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {logged[item.id] ? (
                  <span style={{ fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Dot tone="success" /> 기록됨: {logged[item.id]}
                  </span>
                ) : (
                  LOG_ACTIONS.map((a) => (
                    <Button
                      key={a.action}
                      variant="outline"
                      size="xs"
                      onClick={() => logOutcome(item, a.action, a.label)}
                      active={logging === `${item.id}:${a.action}`}
                      disabled={Boolean(logging)}
                    >
                      {logging === `${item.id}:${a.action}` ? "…" : a.label}
                    </Button>
                  ))
                )}
                {logErrors[item.id] && (
                  <span role="alert" style={{ fontSize: 11.5, color: "var(--danger)", marginLeft: 4 }}>
                    {logErrors[item.id]}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
      <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>
        기록한 결과는 outreach_outcomes에 쌓여 내일 우선순위·전환 퍼널에 반영됩니다.
      </div>
    </div>
  );
}
