"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Drawer, Button, IconButton, Skeleton, EmptyState } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { requestOfficeChat, OFFICE_AGENTS } from "./office-client";

const SUGGESTED_CHIPS = {
  vaporeon: [
    { label: "WBS 마감/확인일 분리", prompt: "기한 지난 작업들과 오늘 할 일의 가용 시간을 계산해서, 실제로 끝낼 수 있는 순서(WBS)로 재정렬하고 후속 확인일을 분리해줘." },
    { label: "오늘 80% 컷오프", prompt: "대표가 지치지 않도록 오늘 꼭 지켜야 하는 필수 작업 1~2개만 남기고 나머지는 다음 주로 안전하게 연기해줘." },
    { label: "병목 1개 집중 해소", prompt: "현재 작업 흐름을 가로막고 있는 단 1개의 핵심 병목을 짚고 오늘 바로 뚫을 액션을 지정해줘." },
  ],
  eevee: [
    { label: "오늘 결정할 1개 압축", prompt: "엉켜 있는 수많은 일들 중에서 오늘 대표가 내려야 할 단 1개의 본질적 결정문을 압축 도출해줘." },
    { label: "담당 C-Level 배정", prompt: "각 문제의 성격에 맞춰 담당 C-Level 1명을 DRI로 배정하고 교통정리해줘." },
    { label: "업무 80% 쳐내기", prompt: "과부하 상태를 해소하기 위해 오늘 계획 중 80%를 단호하게 쳐내줘." },
  ],
  flareon: [
    { label: "1-CTA 후속 제안 카피", prompt: "멈춰 있는 이 딜의 고객이 부담 없이 당장 답장할 수 있는 매력적이고 명확한 1-CTA 후속 제안서 초안을 써줘." },
    { label: "고객 반론 극복 질문", prompt: "고객이 망설이거나 침묵하는 숨은 이유를 짚고 다음 미팅을 확정할 수 있는 질문 스크립트를 작성해줘." },
    { label: "다음 행동 정의", prompt: "관심-접촉-구매의사 단계 중 다음 단계로 넘어가기 위한 최소 행동을 구체화해줘." },
  ],
  leafeon: [
    { label: "지출 상한선(Cap) 설정", prompt: "현재 증가한 운영/도구 지출을 방어하기 위한 현실적인 지출 캡(Cap)을 설정해줘." },
    { label: "도구별 유지비용 ROI 점검", prompt: "정기 구독 중인 서비스들이 대표 시간/체력 투입 대비 실제로 가치를 내고 있는지 손절 기준(Kill Criteria)을 세워줘." },
  ],
  glaceon: [
    { label: "DoD 3문장 압축", prompt: "모호한 범위를 걷어내고, 이번 릴리즈가 '완료'되었다고 검증할 수 있는 통과 조건(DoD) 3문장을 정의해줘." },
    { label: "이번 제외 목록(Out-of-Scope)", prompt: "프로젝트 범위 비대를 막기 위해 이번에 절대 건드리지 않을 제외 목록을 못 박아줘." },
  ],
};

export function OfficeQuickDrawer({
  isOpen = false,
  onClose,
  nudge,
  onApplyText,
  onNavigate,
}) {
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);

  const activeAgent = nudge?.agentId ? (OFFICE_AGENTS[nudge.agentId] || OFFICE_AGENTS.eevee) : OFFICE_AGENTS.eevee;
  const chips = SUGGESTED_CHIPS[nudge?.agentId] || SUGGESTED_CHIPS.eevee;

  // 넛지가 변경되거나 열릴 때 초기화
  useEffect(() => {
    if (isOpen && nudge) {
      setResultText("");
      setStatusNote("");
      setChatInput("");
      setCopied(false);
    }
  }, [isOpen, nudge?.key]);

  const handleExecutePrompt = useCallback(async (promptText) => {
    if (!promptText || loading || !nudge) return;
    setLoading(true);
    setStatusNote("");

    try {
      const res = await requestOfficeChat({
        agentId: nudge.agentId,
        mode: "task",
        message: promptText,
        context: nudge.context || null,
      });

      if (res?.state === "done" && res.text) {
        setResultText(res.text);
      } else {
        setStatusNote(res?.note || "응답을 생성하지 못했습니다.");
      }
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loading, nudge]);

  const handleCopy = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExpandToCouncil = () => {
    if (onNavigate) {
      onClose?.();
      onNavigate("dashboard/agents/office-council");
    }
  };

  if (!isOpen || !nudge) return null;

  return (
    <Drawer
      title={`${activeAgent.nameKo} · ${activeAgent.title}`}
      subtitle={activeAgent.tagline}
      onClose={onClose}
      width="min(520px, 94vw)"
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <Button variant="ghost" size="sm" onClick={handleExpandToCouncil}>
            Council 전체 회의로 확장
          </Button>
          <div style={{ display: "flex", gap: 6 }}>
            {resultText && (
              <>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? "복사 완료" : "복사"}
                </Button>
                {onApplyText && (
                  <Button variant="primary" size="sm" onClick={() => onApplyText(resultText)}>
                    적용하기
                  </Button>
                )}
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      }
    >
      <div className="hub-office-drawer-content">
        {/* 주입된 맥락 카드 */}
        {nudge.context && (
          <div className="hub-office-context-card">
            <div className="hub-office-context-header">감지된 현장 맥락 (Auto Context)</div>
            {nudge.context.overdueCount && (
              <div>
                기한 지난 태스크 <strong>{nudge.context.overdueCount}건</strong> 감지
                {Array.isArray(nudge.context.tasks) && (
                  <ul style={{ margin: "6px 0 0 0", paddingLeft: 18, color: "var(--fg-muted)" }}>
                    {nudge.context.tasks.map((t) => (
                      <li key={t.id || t.title}>
                        {t.title} {t.dueDate ? `(${t.dueDate})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {nudge.context.dealName && (
              <div>
                딜: <strong>{nudge.context.dealName}</strong> · 정체 <strong>{nudge.context.daysStagnant}일</strong>
                {nudge.context.amount ? ` · 규모: ₩${Number(nudge.context.amount).toLocaleString()}` : ""}
              </div>
            )}
            {nudge.context.spent && (
              <div>
                지출 <strong>₩{Number(nudge.context.spent).toLocaleString()}</strong>
                {nudge.context.budget ? ` / 예산 ₩${Number(nudge.context.budget).toLocaleString()}` : ""}
              </div>
            )}
            {nudge.context.signalsCount && (
              <div>확인 대기 신호 <strong>{nudge.context.signalsCount}건</strong></div>
            )}
          </div>
        )}

        {/* 1클릭 추천 액션 칩 */}
        <div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginBottom: 8, fontWeight: 500 }}>
            추천 원클릭 액션 (1-Click Action)
          </div>
          <div className="hub-office-prompt-chips">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                className="hub-office-chip-btn"
                disabled={loading}
                onClick={() => handleExecutePrompt(c.prompt)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 결과 영역 */}
        {loading && (
          <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton lines={4} />
            <div style={{ fontSize: 11.5, color: "var(--fg-faint)", textAlign: "center" }}>
              {activeAgent.nameKo}가 현장 데이터를 분석하고 있습니다...
            </div>
          </div>
        )}

        {statusNote && !loading && (
          <div style={{ color: "var(--warning)", fontSize: 12, padding: "8px 0" }}>
            {statusNote}
          </div>
        )}

        {resultText && !loading && (
          <div>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginBottom: 6, fontWeight: 500 }}>
              {activeAgent.nameKo}의 제안 결과
            </div>
            <div className="hub-office-result-box">{resultText}</div>
          </div>
        )}

        {!resultText && !loading && !statusNote && (
          <EmptyState
            icon="sparkle"
            title="원클릭 액션을 선택하세요"
            description="위의 추천 버튼을 누르면 현장 맥락을 바탕으로 즉시 최적의 조언과 실행 초안을 도출합니다."
          />
        )}

        {/* 추가 직접 질문 인풋 */}
        <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
          <label style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={chatInput}
              placeholder={`${activeAgent.nameKo}에게 직접 지시하거나 질문하기...`}
              disabled={loading}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (chatInput.trim()) {
                    handleExecutePrompt(chatInput.trim());
                    setChatInput("");
                  }
                }
              }}
              style={{
                flex: 1,
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                padding: "8px 12px",
                fontSize: 12.5,
                color: "var(--fg)",
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !chatInput.trim()}
              onClick={() => {
                if (chatInput.trim()) {
                  handleExecutePrompt(chatInput.trim());
                  setChatInput("");
                }
              }}
            >
              전송
            </Button>
          </label>
        </div>
      </div>
    </Drawer>
  );
}
