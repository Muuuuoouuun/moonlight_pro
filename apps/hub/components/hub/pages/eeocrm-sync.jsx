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

const ERROR_HINT = {
  "mcp-unreachable": "eeoCRM MCP 서버에 연결할 수 없습니다 — C:/Projects/eeocrm-personal에서 npm run dev가 실행 중인지 확인하세요.",
  "auth-expired": "개인 토큰이 만료된 것으로 보입니다 — eeocrm-personal 레포에서 npm run login을 다시 실행하세요.",
  "query-failed": "CRM 조회에 실패했습니다. eeoCRM 서버 로그를 확인하세요.",
  "missing-config": "Supabase 연결 정보가 없습니다.",
  "missing-workspace": "기본 워크스페이스가 설정되지 않았습니다.",
};

function summarize(action, results) {
  if (!results) return "완료";
  const parts = [];
  if (results.import) {
    if (results.import.ok === false) {
      parts.push(`import 실패 — ${ERROR_HINT[results.import.reason] || results.import.reason}`);
    } else {
      parts.push(`import 신규 ${results.import.imported ?? 0}건 · skip ${results.import.skipped ?? 0}${results.import.truncated ? " · 더 있음(다음 회차에 이어서)" : ""}`);
    }
  }
  if (results.promote) {
    if (results.promote.ok === false) {
      parts.push(`promote 실패 — ${results.promote.reason || ""}`);
    } else {
      parts.push(`promote 신규 ${results.promote.promoted ?? 0}·매칭 ${results.promote.merged ?? 0}·검토 ${results.promote.review ?? 0}`);
    }
  }
  return parts.length ? parts.join(" · ") : "완료";
}

export function EeocrmSync() {
  const [state, setState] = React.useState({
    syncState: "loading",
    lastSyncAt: null,
    staging: {},
    recentRuns: [],
    mcpUrl: null,
    ownerId: null,
  });
  const [busy, setBusy] = React.useState(null);
  const [msg, setMsg] = React.useState(null);

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, syncState: "loading" }));
    try {
      const r = await fetch("/api/hub/eeocrm", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) {
        setState((s) => ({ ...s, syncState: "error" }));
        return;
      }
      setState({
        syncState: d.status === "live" ? "live" : "preview",
        lastSyncAt: d.lastSyncAt || null,
        staging: d.staging || {},
        recentRuns: Array.isArray(d.recentRuns) ? d.recentRuns : [],
        mcpUrl: d.mcpUrl || null,
        ownerId: d.ownerId || d.expectedOwnerId || null,
      });
    } catch {
      setState((s) => ({ ...s, syncState: "error" }));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const runSync = async (action) => {
    if (busy) return;
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch("/api/integrations/eeocrm/sync", {
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

  const { syncState, lastSyncAt, staging, recentRuns, mcpUrl, ownerId } = state;

  return (
    <div className="hub-page" style={{ padding: "var(--section-gap)", display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 1100 }}>
      <div className="hub-page-header" style={{ display: "flex", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>eeoCRM 동기화</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
            실제 세일즈 파이프라인(eeoCRM) → 리드 원장 · import → 정규화·중복제거
            <span className="mono" style={{ marginLeft: 8, color: syncState === "live" ? "var(--success)" : syncState === "loading" ? "var(--warning)" : "var(--fg-faint)" }}>
              {syncState === "live" ? "live" : syncState === "loading" ? "syncing" : syncState === "error" ? "error" : "preview"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="runs" onClick={load}>새로고침</Button>
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Iconed name="leads" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>eeoCRM (Xiaoshouyi 개인판)</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
              {mcpUrl || "http://localhost:3010/sse"}
              {lastSyncAt ? ` · 최근 ${new Date(lastSyncAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
            </div>
            <div className="mono" style={{ marginTop: 2, fontSize: 10.5, color: "var(--fg-faint)" }}>
              ownerId {ownerId || "3935704427463307"} · junhyuk
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: "var(--fg-faint)", lineHeight: 1.6 }}>
          로컬 전용 연동입니다 — <span className="mono">C:/Projects/eeocrm-personal</span>에서 <span className="mono">npm run dev</span>가 실행 중이어야 동작하고,
          개인 토큰은 ~2시간마다 만료되어 만료 시 <span className="mono">npm run login</span> 재인증이 필요합니다.
        </div>

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
          <Button variant="primary" size="sm" icon="bolt" onClick={() => runSync("all")} active={busy === "all"} disabled={!!busy}>{busy === "all" ? "동기화 중…" : "전체 동기화"}</Button>
          <Button variant="outline" size="sm" icon="download" onClick={() => runSync("import")} active={busy === "import"} disabled={!!busy}>{busy === "import" ? "import 중…" : "CRM→DB import"}</Button>
          <Button variant="outline" size="sm" icon="check" onClick={() => runSync("promote")} active={busy === "promote"} disabled={!!busy}>{busy === "promote" ? "승격 중…" : "승격(dedupe)"}</Button>
        </div>
        {msg && (
          <div style={{ marginTop: 10, fontSize: 12, color: `var(--${msg.tone})`, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <Dot tone={msg.tone} />
            <span>{msg.text}</span>
          </div>
        )}
      </Card>

      <SectionTitle>최근 동기화</SectionTitle>
      <Card pad={false} className="hub-table-card">
        {recentRuns.length === 0 ? (
          <EmptyState
            icon="runs"
            title="동기화 이력이 없습니다"
            description="전체 동기화를 실행하면 여기에 기록됩니다."
          />
        ) : (
          recentRuns.map((run, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 130px", alignItems: "center", padding: "11px 16px", borderBottom: i < recentRuns.length - 1 ? "1px solid var(--line-soft)" : "none", gap: 10 }}>
              <Badge tone={RUN_TONE[run.status] || "neutral"} size="xs">{run.status || "—"}</Badge>
              <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{run.action || "—"}{run.error ? ` · ${ERROR_HINT[run.error] || run.error}` : ""}</span>
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
