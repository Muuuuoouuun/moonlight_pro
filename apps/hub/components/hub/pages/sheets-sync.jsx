"use client";

import React from "react";
import { Iconed } from "../hub-icons";
import { Card, Button, Badge, Dot, SectionTitle, EmptyState } from "../hub-primitives";

const STAGING_LABELS = [
  { key: "pending", label: "대기", tone: "warning" },
  { key: "promoted", label: "신규 등록", tone: "success" },
  { key: "merged", label: "기존 매칭", tone: "moon" },
  { key: "review", label: "검토 필요", tone: "danger" },
];

const RUN_TONE = { success: "success", failure: "danger", running: "warning", queued: "neutral" };

function shortId(id) {
  if (!id) return "—";
  return id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
}

function summarize(action, results) {
  if (!results) return "완료";
  const parts = [];
  if (results.import) parts.push(`import ${results.import.imported ?? 0}건(skip ${results.import.skipped ?? 0})`);
  if (results.promote) parts.push(`promote 신규 ${results.promote.promoted ?? 0}·매칭 ${results.promote.merged ?? 0}·검토 ${results.promote.review ?? 0}`);
  if (results.push) parts.push(`push ${results.push.pushed ?? 0}행`);
  return parts.length ? parts.join(" · ") : "완료";
}

export function SheetsSync() {
  const [state, setState] = React.useState({
    syncState: "loading",
    enabled: false,
    reason: null,
    connected: false,
    spreadsheetId: null,
    lastSyncAt: null,
    staging: {},
    recentRuns: [],
  });
  const [busy, setBusy] = React.useState(null);
  const [msg, setMsg] = React.useState(null);

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, syncState: "loading" }));
    try {
      const r = await fetch("/api/hub/sheets", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) {
        setState((s) => ({ ...s, syncState: "error" }));
        return;
      }
      setState({
        syncState: d.status === "connected" ? "live" : d.status || "preview",
        enabled: Boolean(d.enabled),
        reason: d.reason || null,
        connected: Boolean(d.connected),
        spreadsheetId: d.spreadsheetId || null,
        lastSyncAt: d.lastSyncAt || null,
        staging: d.staging || {},
        recentRuns: Array.isArray(d.recentRuns) ? d.recentRuns : [],
      });
    } catch {
      setState((s) => ({ ...s, syncState: "error" }));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const runSync = async (action) => {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch("/api/integrations/sheets/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setMsg({ tone: "danger", text: d?.reason ? `실패: ${d.reason}` : `실패 (${r.status})` });
      } else {
        setMsg({ tone: d.status === "ok" ? "success" : "warning", text: summarize(action, d?.results) });
        load();
      }
    } catch (e) {
      setMsg({ tone: "danger", text: String(e) });
    } finally {
      setBusy(null);
    }
  };

  const connect = () => {
    window.location.href = "/api/integrations/sheets/connect";
  };

  const { syncState, enabled, reason, connected, spreadsheetId, lastSyncAt, staging, recentRuns } = state;
  const syncLabel = syncState === "live"
    ? "live"
    : syncState === "loading"
      ? "syncing"
      : syncState === "error"
        ? "error"
        : syncState === "disabled"
          ? "disabled"
          : syncState;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1100 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>세일즈 시트 동기화</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            구글시트 ↔ 세일즈 DB · 리드 import → 정규화·중복제거 → 라이브 뷰 push
            <span className="mono" style={{ marginLeft: 8, color: syncState === "live" || syncState === "loading" ? "var(--fg-muted)" : "var(--fg-faint)" }}>
              {syncLabel}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="runs" onClick={load}>새로고침</Button>
      </div>

      {/* Connection card */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: connected ? 12 : 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Iconed name="leads" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Google Sheets</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
              {spreadsheetId ? `sheet ${shortId(spreadsheetId)}` : "스프레드시트 미지정"}
              {lastSyncAt ? ` · 최근 ${new Date(lastSyncAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
            </div>
          </div>
          <Badge tone={connected ? "success" : "neutral"} size="xs">{connected ? "연결됨" : "미연결"}</Badge>
        </div>

        {!connected && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6 }}>
            {enabled
              ? "구글 계정으로 연결하면 시트의 리드를 DB로 가져오고, 라이브 뷰를 시트로 되돌립니다."
              : `Google Sheets OAuth는 아직 비활성입니다 (${reason || "provider-not-enabled"}). callback·scope 검증 후 별도로 켭니다.`}
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" size="sm" icon="link" onClick={connect} disabled={!enabled}>
                {enabled ? "Google Sheets 연결" : "OAuth 비활성"}
              </Button>
            </div>
          </div>
        )}

        {connected && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {STAGING_LABELS.map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line-soft)" }}>
                  <Dot tone={s.tone} />
                  <span style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{s.label}</span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{staging?.[s.key] ?? 0}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" icon="bolt" onClick={() => runSync("all")} active={busy === "all"}>{busy === "all" ? "동기화 중…" : "전체 동기화"}</Button>
              <Button variant="outline" size="sm" icon="download" onClick={() => runSync("import")} active={busy === "import"}>시트→DB import</Button>
              <Button variant="outline" size="sm" icon="check" onClick={() => runSync("promote")} active={busy === "promote"}>승격(dedupe)</Button>
              <Button variant="outline" size="sm" icon="upload" onClick={() => runSync("push")} active={busy === "push"}>DB→시트 push</Button>
              <Button variant="ghost" size="sm" icon="link" onClick={connect}>재연결</Button>
            </div>
            {msg && (
              <div style={{ marginTop: 10, fontSize: 12, color: `var(--${msg.tone})`, display: "flex", alignItems: "center", gap: 6 }}>
                <Dot tone={msg.tone} />
                {msg.text}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Recent sync runs */}
      <SectionTitle>최근 동기화</SectionTitle>
      <Card pad={false} className="hub-table-card">
        {recentRuns.length === 0 ? (
          <EmptyState
            icon="runs"
            title="동기화 이력이 없습니다"
            description={connected ? "전체 동기화를 실행하면 여기에 기록됩니다." : "먼저 Google Sheets를 연결하세요."}
          />
        ) : (
          recentRuns.map((run, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 130px", alignItems: "center", padding: "11px 16px", borderBottom: i < recentRuns.length - 1 ? "1px solid var(--line-soft)" : "none", gap: 10 }}>
              <Badge tone={RUN_TONE[run.status] || "neutral"} size="xs">{run.status || "—"}</Badge>
              <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{run.action || "—"}{run.error ? ` · ${run.error}` : ""}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)", textAlign: "right" }}>
                {run.startedAt ? new Date(run.startedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
