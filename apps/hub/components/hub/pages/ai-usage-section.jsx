"use client";

// 설정 · AI 사용량 — Moonlight가 부른 Gemini 호출의 이번 달·지난달 토큰과 추정 비용(0052 ai_usage_log).
// 운영자 Mac의 로컬 스킬이 다른 계정으로 쓰는 API 비용은 이 기록 밖이다. 경고선·한도는 미정이라 두지 않는다.
import React from "react";
import { Button, Card, SectionTitle, Skeleton, TruthBadge } from "../hub-primitives";

const MONTH_LABEL = { current: "이번 달", previous: "지난달" };

export function formatTokens(value) {
  const number = Number.isFinite(value) ? value : 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 10_000) return `${Math.round(number / 1000)}K`;
  return number.toLocaleString("ko-KR");
}

export function formatUsd(usd) {
  if (!Number.isFinite(usd)) return "단가 미확인";
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function monthName(key) {
  const month = Number(String(key || "").slice(5, 7));
  return month >= 1 && month <= 12 ? `${month}월` : "";
}

// Reads the Hub read envelope, never just `response.ok` (CLAUDE.md 2026-09-01).
export function aiUsageViewState(data) {
  if (!data || typeof data !== "object") return "error";
  if (data.status === "error" || data.source === "error") return "error";
  if (data.status === "preview") return "preview";
  if ((data.status === "live" || data.status === "partial") && data.current && data.previous) return data.status;
  return "error";
}

function MonthSummary({ slot, month }) {
  const label = `${MONTH_LABEL[slot]} · ${monthName(month.key)}`;
  const hasCost = Number.isFinite(month.estimatedUsd);
  return (
    <div style={{ padding: "14px 16px", border: "1px solid var(--line-soft)", borderRadius: "var(--r)", background: "var(--surface-2)", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--fg-dim)", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <span className="stat" aria-label={`${label} 추정 비용 ${hasCost ? formatUsd(month.estimatedUsd) : "단가 미확인"}`} style={{ fontSize: 26, fontWeight: 500, color: "var(--fg)" }}>
          {month.calls === 0 ? "$0.00" : hasCost ? formatUsd(month.estimatedUsd) : "—"}
        </span>
        {hasCost && month.calls > 0 && (
          <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>≈ ₩{Number(month.estimatedKrw || 0).toLocaleString("ko-KR")}</span>
        )}
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>
        {month.calls === 0 ? "기록된 호출 없음" : `호출 ${month.calls.toLocaleString("ko-KR")}회 · 토큰 ${formatTokens(month.totalTokens)}`}
      </div>
      {month.calls > 0 && (
        <div className="mono" style={{ fontSize: 12, color: "var(--fg-dim)", marginTop: 4 }}>
          입력 {formatTokens(month.promptTokens)} · 출력 {formatTokens(month.outputTokens)} · 생각 {formatTokens(month.thinkingTokens)}
        </div>
      )}
      {month.unpricedCalls > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 4 }}>단가 미확인 모델 {month.unpricedCalls}회는 비용에서 빠짐</div>
      )}
    </div>
  );
}

function ModelCell({ slot, entry }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>{MONTH_LABEL[slot]}</div>
      <div className="mono" style={{ fontSize: 12, color: entry ? "var(--fg)" : "var(--fg-faint)", marginTop: 2 }}>
        {entry ? `${entry.calls}회 · ${formatTokens(entry.totalTokens)} · ${formatUsd(entry.estimatedUsd)}` : "—"}
      </div>
    </div>
  );
}

function ModelRows({ current, previous }) {
  const names = [...new Set([...current.models, ...previous.models].map((entry) => entry.model))];
  if (!names.length) return null;
  const find = (month, name) => month.models.find((entry) => entry.model === name) || null;
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--line-soft)" }}>
      {names.map((name) => {
        const now = find(current, name);
        const before = find(previous, name);
        const unpriced = (now && !now.priced) || (before && !before.priced);
        return (
          <div key={name} style={{ padding: "10px 0", borderBottom: "1px solid var(--line-soft)", display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "baseline" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--fg)", overflowWrap: "anywhere" }}>{name}</span>
              {unpriced && <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>단가 미확인</span>}
            </div>
            <ModelCell slot="current" entry={now} />
            <ModelCell slot="previous" entry={before} />
          </div>
        );
      })}
    </div>
  );
}

export function AiUsageView({ view, data, onRetry }) {
  const pricing = data?.pricing;
  return (
    <div>
      <SectionTitle
        subtitle="Moonlight가 부른 Gemini 호출만 · 비용은 추정"
        right={view === "partial" ? <TruthBadge state="partial" reason="기록 상한" /> : null}
      >
        AI 사용량
      </SectionTitle>
      <Card>
        {view === "loading" && <Skeleton lines={4} label="AI 사용량 불러오는 중" />}
        {view === "error" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <TruthBadge state="error" />
            <span style={{ fontSize: 12, color: "var(--fg-muted)", flex: "1 1 200px" }}>AI 사용량을 읽지 못했습니다.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>다시 불러오기</Button>
          </div>
        )}
        {view === "preview" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <TruthBadge state="preview" />
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>저장소를 연결하면 AI 호출의 토큰 수가 기록됩니다.</span>
          </div>
        )}
        {(view === "live" || view === "partial") && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <MonthSummary slot="current" month={data.current} />
              <MonthSummary slot="previous" month={data.previous} />
            </div>
            <ModelRows current={data.current} previous={data.previous} />
            <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 12, lineHeight: 1.6 }}>
              추정 비용 = 모델별 공개 단가 × 토큰(출력에 생각 토큰 포함). 단가 확인 <span className="mono">{pricing?.checkedAt}</span>
              {Number.isFinite(pricing?.usdKrw) && <> · 환율 <span className="mono">₩{pricing.usdKrw.toLocaleString("ko-KR")}/$</span> (<span className="mono">{pricing.usdKrwCheckedAt}</span>)</>}
              {" "}· 운영자 Mac의 로컬 스킬이 쓰는 API 비용은 포함하지 않습니다.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export function AiUsageSection() {
  const [state, setState] = React.useState({ view: "loading", data: null });
  const load = React.useCallback(async () => {
    setState({ view: "loading", data: null });
    try {
      const response = await fetch("/api/hub/ai-usage", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      setState({ view: aiUsageViewState(data), data });
    } catch {
      setState({ view: "error", data: null });
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return <AiUsageView view={state.view} data={state.data} onRetry={load} />;
}
