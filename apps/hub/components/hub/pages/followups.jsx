"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Card, Button, Badge, Dot, SectionTitle, EmptyState } from "../hub-primitives";
import { QUICK_LOG_ACTIONS as LOG_ACTIONS } from "@/lib/sales-os/outcome-attribution";

const STAGE_TONE = { new: "neutral", qualified: "info", nurturing: "moon", proposal: "moon", negotiation: "warning", prospect: "neutral" };
const CHANNEL_ICON = { "전화/문자": "chat", "방문": "building", "카톡": "chat" };

export function Followups() {
  const [state, setState] = React.useState({ syncState: "loading", items: [], summary: {} });
  const [logging, setLogging] = React.useState(null); // `${id}:${action}` in-flight
  const [logged, setLogged] = React.useState({}); // id → action label

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
      });
    } catch {
      setState((s) => ({ ...s, syncState: "error" }));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const logOutcome = async (item, action, label) => {
    setLogging(`${item.id}:${action}`);
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
          note: `${item.name} · ${item.why}`,
        }),
      });
      setLogged((m) => ({ ...m, [item.id]: label }));
    } catch {
      /* non-fatal */
    } finally {
      setLogging(null);
    }
  };

  const { syncState, items, summary } = state;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1100 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>팔로업</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            오늘 연락할 사람 · 채널 · 왜 · 다음 행동
            <span className="mono" style={{ marginLeft: 8, color: syncState === "live" ? "var(--success)" : syncState === "loading" ? "var(--warning)" : "var(--fg-faint)" }}>
              {syncState === "live" ? `${summary.overdue ?? 0} overdue` : syncState === "loading" ? "loading" : syncState === "error" ? "error" : "preview"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="runs" onClick={load}>새로고침</Button>
      </div>

      <Card pad={false} className="hub-table-card">
        {items.length === 0 ? (
          <EmptyState
            icon="rhythm"
            title={syncState === "live" ? "오늘 챙길 팔로업이 없습니다" : "팔로업 데이터 없음"}
            description={syncState === "live" ? "정체된 리드·딜이 생기면 여기에 우선순위로 뜹니다." : "리드·딜이 쌓이고 Supabase가 연결되면 표시됩니다."}
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
                    >
                      {logging === `${item.id}:${a.action}` ? "…" : a.label}
                    </Button>
                  ))
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
