"use client";

import React from "react";
import { Button, Card, Badge, TruthBadge } from "../hub-primitives";

const GOAL_LABELS = {
  sales_insight: "영업 인사이트",
  content_hook: "콘텐츠 훅",
  operational_rule: "운영 체크리스트",
  decision_rationale: "의사결정 배경",
  general: "종합 패턴",
};

export function MemoPatternPanel({
  loading,
  error,
  patterns = [],
  unverifiedQuotesFiltered = 0,
  onClose,
  onNavigate,
}) {
  const [createdTaskMap, setCreatedTaskMap] = React.useState({});

  const handleCreateTask = async (guidance, idx) => {
    try {
      const res = await fetch("/api/hub/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: guidance.slice(0, 100),
          description: `[패턴 도출 근거 실행 태스크]\n${guidance}`,
        }),
      });
      if (res.ok) {
        setCreatedTaskMap((prev) => ({ ...prev, [idx]: true }));
      }
    } catch (e) {
      console.error("Failed to create task from pattern", e);
    }
  };

  return (
    <div className="memo-pattern-panel fade-up" style={{ marginTop: 16 }}>
      <Card pad={true} style={{ border: "1px solid var(--line-strong)", background: "var(--surface-1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <strong style={{ fontSize: 15, fontWeight: 600 }}>메모 패턴 분석 및 실행 도출</strong>
            <TruthBadge state={loading ? "loading" : error ? "error" : "live"} />
          </div>
          <Button variant="ghost" size="xs" onClick={onClose}>
            닫기 ✕
          </Button>
        </div>

        {loading && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--fg-muted)" }}>
            <p>선택한 메모들을 분석하고 검증된 근거 인용문을 추출하고 있어요…</p>
          </div>
        )}

        {error && (
          <div role="alert" className="memo-feedback" style={{ marginBottom: 16 }}>
            <p>패턴 분석 중 문제가 발생했습니다: {error}</p>
          </div>
        )}

        {!loading && !error && patterns.length === 0 && (
          <p style={{ color: "var(--fg-muted)", fontSize: 13 }}>도출된 패턴이 없습니다.</p>
        )}

        {!loading && patterns.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {patterns.map((p, idx) => (
              <div
                key={p.id || idx}
                style={{
                  padding: 16,
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone="moon">{GOAL_LABELS[p.kind] || "패턴"}</Badge>
                    <strong style={{ fontSize: 14 }}>{p.title}</strong>
                  </div>
                  <Badge tone={p.suggestedTarget === "content" ? "company" : "personal"}>
                    {p.suggestedTarget === "content" ? "콘텐츠 추천" : "태스크 추천"}
                  </Badge>
                </div>

                <div style={{ fontSize: 13, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div>
                    <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>🔍 관찰 (사실): </span>
                    <span>{p.observation}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>💭 해석 (가설): </span>
                    <span>{p.interpretation}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--moon-300)", fontWeight: 600 }}>🎯 다음 행동: </span>
                    <strong>{p.actionableGuidance}</strong>
                  </div>
                </div>

                {p.evidenceQuotes && p.evidenceQuotes.length > 0 && (
                  <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
                    <span style={{ fontSize: 11, color: "var(--fg-muted)", display: "block", marginBottom: 6 }}>
                      📌 정직한 원문 발췌 (Honest Attribution):
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {p.evidenceQuotes.map((eq, qIdx) => (
                        <div
                          key={qIdx}
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            background: "var(--surface-3)",
                            borderRadius: 4,
                            borderLeft: "2px solid var(--moon-400)",
                          }}
                        >
                          <span style={{ fontStyle: "italic" }}>"{eq.quote}"</span>
                          {eq.occurredAt && (
                            <span style={{ fontSize: 10.5, color: "var(--fg-muted)", marginLeft: 6 }}>
                              ({eq.occurredAt.slice(0, 10)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Button
                    variant="primary"
                    size="xs"
                    icon={createdTaskMap[idx] ? "check" : "plus"}
                    disabled={createdTaskMap[idx]}
                    onClick={() => handleCreateTask(p.actionableGuidance, idx)}
                  >
                    {createdTaskMap[idx] ? "태스크 등록됨 ✓" : "할 일(Task)로 만들기"}
                  </Button>
                  {onNavigate && p.suggestedTarget === "content" && (
                    <Button
                      variant="outline"
                      size="xs"
                      icon="sparkle"
                      onClick={() =>
                        onNavigate(
                          `dashboard/content/studio?from=pattern&source=${encodeURIComponent(p.title)}&quote=${encodeURIComponent(p.evidenceQuotes?.[0]?.quote || "")}`
                        )
                      }
                    >
                      Studio 소재로 보내기
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
