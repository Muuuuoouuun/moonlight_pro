"use client";

import React from "react";
import { Button, Card, Badge, Skeleton, TruthBadge } from "../hub-primitives";
import { freezeTaskCommand, saveTaskCommand, TASK_OUTCOME } from "@/lib/memo-intake-tasks";

const GOAL_LABELS = {
  sales_insight: "영업 인사이트",
  content_hook: "콘텐츠 훅",
  operational_rule: "운영 체크리스트",
  decision_rationale: "의사결정 배경",
  general: "종합 패턴",
  weekly_synthesis: "주간 신경망 종합 보고서",
};

// 패턴의 "다음 행동"을 할 일 명령으로 만든다. id는 호출처가 패턴 결과 하나에 한 번만 정해 재시도에
// 그대로 다시 보낸다 — 202 preview·응답 유실 뒤 재시도가 새 id로 중복 할 일을 만들지 않는다.
export function patternTaskCommand(pattern, id) {
  const guidance = String(pattern?.actionableGuidance || "").trim();
  return freezeTaskCommand({ id, task: guidance.slice(0, 100) }, {
    description: `[패턴 도출 근거 실행 태스크]\n${guidance}`,
    source: "memo-pattern",
  }).command;
}

export function MemoPatternPanel({
  loading,
  error,
  patterns = [],
  unverifiedQuotesFiltered = 0,
  onClose,
  onNavigate,
}) {
  // 등록 상태는 인덱스가 아니라 명령 id에 묶는다. id는 패턴 객체마다 한 번 정해지므로 다시
  // 분석하면 새 결과 = 새 id(이전 결과의 "등록됨"이 새 패턴에 번지지 않는다)이고, 같은 결과의
  // 재시도는 같은 id다.
  const taskIds = React.useRef(new WeakMap());
  const taskIdFor = (pattern) => {
    let id = taskIds.current.get(pattern);
    if (!id) {
      id = crypto.randomUUID();
      taskIds.current.set(pattern, id);
    }
    return id;
  };
  const [tasks, setTasks] = React.useState({});
  const patchTask = (id, patch) => setTasks((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // 저장 판정은 공용 경로(saveTaskCommand)가 봉투로 한다 — res.ok만 보면 202 preview가 "등록됨"이 된다.
  const handleCreateTask = async (pattern) => {
    const id = taskIdFor(pattern);
    if (["sending", "saved"].includes(tasks[id]?.status)) return;
    patchTask(id, { status: "sending", error: null });
    patchTask(id, await saveTaskCommand(patternTaskCommand(pattern, id)));
  };

  return (
    <div className="memo-pattern-panel fade-up" style={{ marginTop: 16 }}>
      <Card pad={true} style={{ border: "1px solid var(--line-strong)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 15, fontWeight: 600 }}>메모 패턴 분석 및 실행 도출</strong>
            <TruthBadge state={loading ? "loading" : error ? "error" : "live"} />
          </div>
          <Button variant="ghost" size="xs" onClick={onClose}>
            닫기
          </Button>
        </div>

        {loading && (
          <Skeleton lines={4} height={14} label="선택한 메모의 패턴과 근거 인용문 분석 중" style={{ padding: "8px 0" }} />
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
          <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {patterns.map((p, idx) => {
              const task = tasks[taskIdFor(p)] || {};
              const saved = task.status === "saved";
              const sending = task.status === "sending";
              const settled = TASK_OUTCOME[task.status];
              const hasGuidance = Boolean(String(p.actionableGuidance || "").trim());
              return (
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
                      <Badge tone="neutral">{GOAL_LABELS[p.kind] || "패턴"}</Badge>
                      <strong style={{ fontSize: 14 }}>{p.title}</strong>
                    </div>
                    <Badge tone="neutral">
                      {p.suggestedTarget === "content" ? "콘텐츠 추천" : "태스크 추천"}
                    </Badge>
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div>
                      <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>관찰 (사실): </span>
                      <span>{p.observation}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>해석 (가설): </span>
                      <span>{p.interpretation}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>다음 행동: </span>
                      <strong>{p.actionableGuidance}</strong>
                    </div>
                  </div>

                  {p.evidenceQuotes && p.evidenceQuotes.length > 0 && (
                    <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
                      <span style={{ fontSize: 11, color: "var(--fg-muted)", display: "block", marginBottom: 6 }}>
                        정직한 원문 발췌 (Honest Attribution):
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {p.evidenceQuotes.map((eq, qIdx) => (
                          <div
                            key={qIdx}
                            style={{
                              fontSize: 12,
                              padding: "4px 8px",
                              background: "var(--surface-3)",
                              borderRadius: "var(--r-xs)",
                              borderLeft: "1px solid var(--line-strong)",
                            }}
                          >
                            <span style={{ fontStyle: "italic" }}>"{eq.quote}"</span>
                            {eq.occurredAt && (
                              <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-muted)", marginLeft: 6 }}>
                                ({eq.occurredAt.slice(0, 10)})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    <Button
                      variant={saved ? "ghost" : "outline"}
                      size="xs"
                      icon={saved ? "check" : "plus"}
                      disabled={saved || sending || !hasGuidance}
                      onClick={() => handleCreateTask(p)}
                    >
                      {saved ? "할 일 등록됨" : sending ? "등록 중…" : settled ? settled.retry : "할 일로 만들기"}
                    </Button>
                    {settled && <TruthBadge state={settled.truth} label={settled.label} />}
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
                    {settled && task.error && (
                      <span style={{ flexBasis: "100%", color: "var(--fg-muted)", fontSize: 12 }}>{task.error}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
