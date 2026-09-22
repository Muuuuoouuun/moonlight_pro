"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Badge,
  Card,
  Button,
  IconButton,
  Avatar,
  EmptyState,
  SegmentedControl,
  CheckboxRow,
} from "../hub-primitives";
import { Iconed } from "../hub-icons";
import {
  requestOfficeChat,
  OFFICE_AGENTS,
  OFFICE_AGENT_IDS,
  OFFICE_DEFAULT_COUNCILS,
  OFFICE_MODE_LABEL,
} from "../office-client";

const AGENT_SHORTCUTS = {
  eevee: [
    "오늘 결정할 핵심 안건 1문장 압축 및 담당 C-Level 배정",
    "다자 이견 정리 및 단일 추천 결정문 도출",
    "지친 대표를 위한 긴급 업무 80% 컷오프",
  ],
  vaporeon: [
    "가용 시간 대조 오늘 마감 WBS 및 후속 확인일 분리",
    "병목 구간 1개 해소 및 무리한 일정 재정렬",
    "외부 응답 대기 상태와 직접 실행 작업 분리",
  ],
  jolteon: [
    "최소 변경 단위(Diff) 및 로컬 테스트 검증 계획",
    "운영 배포 전 실패 원인 추적 및 롤백 플랜",
    "외부 연동 전 모의 환경 검증 스펙",
  ],
  flareon: [
    "정체 딜 고객 맞춤 1-CTA 후속 제안서 초안 (격식체)",
    "고객 반론 극복 및 다음 미팅 확정 질문 스크립트",
    "관심-접촉-구매의사-결제 단계별 다음 행동 정의",
  ],
  espeon: [
    "신규 기회 대비 기회비용 및 포기할 대안 비교표",
    "1주일 가설 검증 실험 설계 및 중단 기준(Kill Criteria)",
    "현상 유지 비용(Cost of Inaction) 분석",
  ],
  umbreon: [
    "기획안 4단 독립 감사(위치-결함근거-영향-수정안)",
    "안전 통과 조건(Pass Criteria) 및 보완 대체 표현",
    "출처 결측 및 허위 보장성 문구 검출",
  ],
  leafeon: [
    "초기 vs 반복 유지 비용 계산 및 지출 상한선(Cap) 설정",
    "대표 시간/체력 투입량 대비 비즈니스 타당성 점검",
    "손절/중단 기준(Kill Criteria) 설정",
  ],
  glaceon: [
    "최소 구현 범위(MVP) 및 검증 가능한 완료 조건(DoD)",
    "이번 릴리즈 제외 목록(Out-of-Scope) 및 사용자 흐름",
    "모호한 수식어 걷어낸 핵심 문제 정의 1문장",
  ],
  sylveon: [
    "타깃 관점 헤드라인 카피 3종 및 즉시 복사 본문 초안",
    "진부한 공급자 설명 대체할 실제 전환 카피 제안",
    "고객 문제 장면 중심의 브랜드 스토리텔링 초안",
  ],
};

export function OfficeCouncil({ onNavigate }) {
  const [mainMode, setMainMode] = useState("chat"); // 'chat' (1:1) | 'council' (다자 협업)
  const [activeAgentId, setActiveAgentId] = useState("eevee");
  const [chatSubMode, setChatSubMode] = useState("chat"); // 'chat' | 'task' | 'critique'
  const [harshEval, setHarshEval] = useState(false);

  // Council mode state
  const [councilLead, setCouncilLead] = useState(OFFICE_DEFAULT_COUNCILS[0].lead);
  const [councilParticipants, setCouncilParticipants] = useState(
    OFFICE_DEFAULT_COUNCILS[0].participants
  );
  const [selectedAgendaIdx, setSelectedAgendaIdx] = useState(0);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorNote, setErrorNote] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const [thread, setThread] = useState([
    {
      role: "agent",
      agentId: "eevee",
      text: "대표님, 오셨어요? 비서실장 이브이입니다! 복잡하거나 머리 아픈 일 있으시면 편하게 털어놔 주세요. 제가 핵심 딱 추려서 담당 임원 연결해 드릴게요!",
      time: "방금",
    },
  ]);

  const busyRef = useRef(false);
  const activeAgent = OFFICE_AGENTS[activeAgentId] || OFFICE_AGENTS.eevee;

  const handleSelectAgendaPreset = (idx) => {
    setSelectedAgendaIdx(idx);
    const preset = OFFICE_DEFAULT_COUNCILS[idx];
    if (preset) {
      setCouncilLead(preset.lead);
      setCouncilParticipants(preset.participants);
    }
  };

  const handleToggleParticipant = (agentId) => {
    if (agentId === councilLead) return;
    setCouncilParticipants((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setErrorNote(null);
    setInput("");

    const now = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const isCouncil = mainMode === "council";
    const sendingAgentId = isCouncil ? councilLead : activeAgentId;
    const mode = isCouncil ? "council" : chatSubMode;
    const evaluate = isCouncil ? true : harshEval;

    setThread((prev) => [
      ...prev,
      { role: "user", text, time: now },
      {
        role: "agent",
        agentId: sendingAgentId,
        pending: true,
        isSimulation: isCouncil,
        time: now,
      },
    ]);

    try {
      const res = await requestOfficeChat({
        agentId: sendingAgentId,
        mode,
        message: text,
        participants: isCouncil ? councilParticipants : [],
        evaluate,
      });

      setThread((prev) => {
        const next = prev.slice();
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].pending) {
            if (res.state === "done") {
              next[i] = {
                role: "agent",
                agentId: res.agentId || sendingAgentId,
                text: res.text,
                isSimulation: res.isSimulation,
                evaluation: res.evaluation || null,
                model: res.model || null,
                latencyMs: res.latencyMs || null,
                fallbackFrom: res.fallbackFrom || null,
                time: now,
              };
            } else {
              next[i] = {
                role: "agent",
                agentId: sendingAgentId,
                text: res.note || "응답 생성 중 문제가 발생했습니다.",
                isError: true,
                time: now,
              };
            }
            break;
          }
        }
        return next;
      });

      if (res.state === "error") {
        setErrorNote(res.note);
      }
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : "요청 실패");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [input, mainMode, councilLead, activeAgentId, chatSubMode, councilParticipants, harshEval]);

  const copyToClipboard = (text, idx) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div
      className="hub-office-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 500,
                lineHeight: 1.2,
                color: "var(--fg)",
              }}
            >
              Office Council
            </h2>
            <Badge tone="moon" size="sm">
              C-Level 9인 오피스
            </Badge>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg-muted)",
              marginTop: 4,
            }}
          >
            이브이 비서실장과 8인의 진화체 임원이 운영자의 빠른 판단과 실행을 돕습니다.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SegmentedControl
            options={[
              { id: "chat", label: "1:1 전담 업무", icon: "user" },
              { id: "council", label: "Council 종합 협업", icon: "users" },
            ]}
            value={mainMode}
            onChange={setMainMode}
            size="sm"
          />
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mainMode === "chat" ? "280px 1fr" : "320px 1fr",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Left Sidebar / Config Panel */}
        <aside
          style={{
            borderRight: "1px solid var(--line-soft)",
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {mainMode === "chat" ? (
            // 1:1 Persona Selection List
            <div className="scroll-y" style={{ flex: 1, padding: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--fg-dim)",
                  padding: "6px 8px 8px",
                }}
              >
                오피스 임원 선택
              </div>
              {OFFICE_AGENT_IDS.map((id) => {
                const agent = OFFICE_AGENTS[id];
                const active = activeAgentId === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveAgentId(id)}
                    className="hub-card-link"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      marginBottom: 4,
                      background: active ? "var(--surface-3)" : "transparent",
                      border: active
                        ? "1px solid var(--line-strong)"
                        : "1px solid transparent",
                      borderLeft: active
                        ? "3px solid var(--moon-300)"
                        : "3px solid transparent",
                      borderRadius: "var(--r-sm)",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: active ? 600 : 500,
                          color: active ? "var(--fg)" : "var(--fg-muted)",
                        }}
                      >
                        {agent.nameKo}
                      </span>
                      <Badge
                        size="xs"
                        tone={active ? "moon" : "neutral"}
                        variant="outline"
                      >
                        {agent.domain}
                      </Badge>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-faint)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {agent.role}
                    </div>
                    {active && agent.resultFocus && (
                      <div
                        style={{
                          fontSize: 10.5,
                          color: "var(--moon-300)",
                          lineHeight: 1.3,
                          marginTop: 2,
                        }}
                      >
                        🎯 {agent.resultFocus}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            // Council Configuration Panel
            <div className="scroll-y" style={{ flex: 1, padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--fg-dim)",
                  }}
                >
                  안건 프리셋
                </span>
                <Badge tone="moon" size="xs">
                  관점 시뮬레이션
                </Badge>
              </div>

              {/* Agenda Presets */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginBottom: 16,
                }}
              >
                {OFFICE_DEFAULT_COUNCILS.map((preset, idx) => (
                  <button
                    key={preset.agenda}
                    onClick={() => handleSelectAgendaPreset(idx)}
                    className="hub-btn"
                    style={{
                      padding: "8px 10px",
                      fontSize: 12,
                      textAlign: "left",
                      borderRadius: "var(--r-sm)",
                      background:
                        selectedAgendaIdx === idx
                          ? "var(--surface-3)"
                          : "var(--surface-2)",
                      border:
                        selectedAgendaIdx === idx
                          ? "1px solid var(--line-strong)"
                          : "1px solid var(--line-soft)",
                      color:
                        selectedAgendaIdx === idx
                          ? "var(--fg)"
                          : "var(--fg-muted)",
                    }}
                  >
                    📌 {preset.agenda}
                  </button>
                ))}
              </div>

              {/* Council Lead Selector */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--fg-dim)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  주관 임원 (Lead)
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {OFFICE_AGENT_IDS.map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        setCouncilLead(id);
                        setCouncilParticipants((prev) =>
                          prev.filter((pId) => pId !== id)
                        );
                      }}
                      className="hub-btn"
                      style={{
                        padding: "4px 8px",
                        fontSize: 11,
                        borderRadius: "var(--r-sm)",
                        background:
                          councilLead === id
                            ? "var(--moon-bg)"
                            : "var(--surface-2)",
                        border:
                          councilLead === id
                            ? "1px solid var(--moon-400)"
                            : "1px solid var(--line-soft)",
                        color:
                          councilLead === id
                            ? "var(--moon-100)"
                            : "var(--fg-muted)",
                        fontWeight: councilLead === id ? 600 : 400,
                      }}
                    >
                      {OFFICE_AGENTS[id].nameKo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Council Participants Selector */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--fg-dim)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  참여 검토자 (Reviewers)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {OFFICE_AGENT_IDS.filter((id) => id !== councilLead).map((id) => {
                    const selected = councilParticipants.includes(id);
                    const agent = OFFICE_AGENTS[id];
                    return (
                      <button
                        key={id}
                        onClick={() => handleToggleParticipant(id)}
                        className="hub-btn"
                        style={{
                          padding: "6px 8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderRadius: "var(--r-sm)",
                          background: selected
                            ? "var(--surface-3)"
                            : "transparent",
                          border: selected
                            ? "1px solid var(--line)"
                            : "1px solid transparent",
                          color: selected
                            ? "var(--fg)"
                            : "var(--fg-muted)",
                          fontSize: 11.5,
                        }}
                      >
                        <span>
                          {selected ? "☑" : "☐"} {agent.nameKo} ({agent.title})
                        </span>
                        <span style={{ fontSize: 10, color: "var(--fg-faint)" }}>
                          {agent.domain}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Right Main Content & Chat Pane */}
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--bg)",
          }}
        >
          {/* Active Mode / Agent Banner */}
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--line-soft)",
              background: "var(--surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {mainMode === "chat" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={activeAgent.nameKo} size={28} tone="moon" />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                      {activeAgent.nameKo}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                      {activeAgent.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--moon-300)" }}>
                    "{activeAgent.tagline}"
                  </div>
                  {activeAgent.resultFocus && (
                    <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2 }}>
                      <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>결과:</span> {activeAgent.resultFocus} · <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>방향:</span> {activeAgent.directionFocus}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name="Council" size={28} tone="moon" />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                      Office Council Convene
                    </span>
                    <Badge tone="moon" size="xs">
                      주관: {OFFICE_AGENTS[councilLead]?.nameKo}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
                    참여 검토:{" "}
                    {councilParticipants
                      .map((id) => OFFICE_AGENTS[id]?.nameKo)
                      .filter(Boolean)
                      .join(", ") || "단독 검토"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--moon-300)", marginTop: 2 }}>
                    결과-방향성: 단일 추천 결정(1문장) · 포기할 대안 · 재검토 조건(Kill Criteria) 도출
                  </div>
                </div>
              </div>
            )}

            {/* Sub-mode for 1:1 chat */}
            {mainMode === "chat" && (
              <SegmentedControl
                options={[
                  { id: "chat", label: "대화" },
                  { id: "task", label: "실행초안" },
                  { id: "critique", label: "감사/진단" },
                ]}
                value={chatSubMode}
                onChange={setChatSubMode}
                size="xs"
              />
            )}
          </div>

          {/* Conversation Thread */}
          <div
            className="scroll-y"
            style={{
              flex: 1,
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {thread.map((msg, idx) => {
              const isUser = msg.role === "user";
              const agentMeta = msg.agentId ? OFFICE_AGENTS[msg.agentId] : activeAgent;

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "var(--fg-faint)",
                    }}
                  >
                    {!isUser && (
                      <span style={{ fontWeight: 600, color: "var(--fg-muted)" }}>
                        {agentMeta?.nameKo || "에이전트"}
                      </span>
                    )}
                    {msg.isSimulation && (
                      <Badge size="xs" tone="moon" variant="outline">
                        관점 시뮬레이션
                      </Badge>
                    )}
                    {msg.model && (
                      <span
                        className="mono"
                        style={{ fontSize: 10, color: "var(--fg-dim)" }}
                        title={msg.fallbackFrom ? `폴백 적용: ${msg.fallbackFrom} → ${msg.model}` : undefined}
                      >
                        {msg.model.replace(/^gemini-/, "")}
                      </span>
                    )}
                    {typeof msg.latencyMs === "number" && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--fg-dim)" }}>
                        {msg.latencyMs}ms
                      </span>
                    )}
                    <span className="mono">{msg.time}</span>
                  </div>

                  <div
                    style={{
                      maxWidth: isUser ? "75%" : "85%",
                      padding: "12px 16px",
                      borderRadius: "var(--r-md)",
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      background: isUser ? "var(--surface-3)" : "var(--surface)",
                      border: isUser
                        ? "1px solid var(--line-strong)"
                        : "1px solid var(--line-soft)",
                      color: "var(--fg)",
                    }}
                  >
                    {msg.pending ? (
                      <span style={{ color: "var(--fg-muted)" }}>
                        {msg.isSimulation
                          ? "Council 관점들을 종합 분석하는 중…"
                          : `${agentMeta?.nameKo || "에이전트"}가 생각하는 중…`}
                      </span>
                    ) : (
                      <>
                        {msg.evaluation && (
                          <div
                            style={{
                              marginBottom: 12,
                              padding: "8px 12px",
                              borderRadius: "var(--r-sm)",
                              background: "var(--surface-2)",
                              border: "1px solid var(--line-soft)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: "var(--fg-dim)",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  가혹 게이트 평가
                                </span>
                                {msg.evaluation.gate && (
                                  <Badge
                                    size="xs"
                                    tone={
                                      msg.evaluation.gate === "PASS"
                                        ? "success"
                                        : msg.evaluation.gate === "REVISE"
                                        ? "warning"
                                        : "danger"
                                    }
                                  >
                                    {msg.evaluation.gate}
                                  </Badge>
                                )}
                              </div>
                              {typeof msg.evaluation.score === "number" && (
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color:
                                      msg.evaluation.score >= 80
                                        ? "var(--success)"
                                        : msg.evaluation.score >= 60
                                        ? "var(--warning)"
                                        : "var(--danger)",
                                  }}
                                >
                                  {msg.evaluation.score} / 100점
                                </span>
                              )}
                            </div>
                            {msg.evaluation.summary && (
                              <div style={{ fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.4 }}>
                                {msg.evaluation.summary}
                              </div>
                            )}
                          </div>
                        )}
                        {msg.text}
                      </>
                    )}
                  </div>

                  {!isUser && !msg.pending && !msg.isError && (
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => copyToClipboard(msg.text, idx)}
                      >
                        {copiedIndex === idx ? "복사됨 ✓" : "내용 복사"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Prompt Suggestions */}
          {mainMode === "chat" && AGENT_SHORTCUTS[activeAgentId] && (
            <div
              style={{
                padding: "8px 20px 4px",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {AGENT_SHORTCUTS[activeAgentId].map((sc) => (
                <button
                  key={sc}
                  onClick={() => setInput(sc)}
                  className="hub-btn"
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    borderRadius: "var(--r-sm)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--line-soft)",
                    color: "var(--fg-muted)",
                    cursor: "pointer",
                  }}
                >
                  💡 {sc}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <div
            style={{
              padding: "12px 20px 16px",
              borderTop: "1px solid var(--line-soft)",
              background: "var(--surface)",
            }}
          >
            {errorNote && (
              <div
                style={{
                  marginBottom: 8,
                  fontSize: 11.5,
                  color: "var(--danger)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>⚠️ {errorNote}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                gap: 12,
              }}
            >
              <CheckboxRow
                checked={mainMode === "council" ? true : harshEval}
                onChange={mainMode === "council" ? undefined : setHarshEval}
                disabled={busy || mainMode === "council"}
                size={15}
                text={
                  mainMode === "council"
                    ? "Council 종합 게이트 평가 (상시 적용: PASS/REVISE/REJECT)"
                    : "가혹 감점 평가 (0~100점 & Gate) 활성화"
                }
                style={{
                  fontSize: 12,
                  color: (mainMode === "council" || harshEval) ? "var(--fg)" : "var(--fg-muted)",
                  cursor: (busy || mainMode === "council") ? "default" : "pointer",
                }}
              />
              <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>
                ⌘+Enter로 전송
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  mainMode === "council"
                    ? `Office Council에 종합 자문을 구할 안건을 입력하세요 (⌘+Enter로 전송)`
                    : `${activeAgent.nameKo}에게 요청할 내용을 입력하세요 (⌘+Enter로 전송)`
                }
                rows={2}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  fontSize: 13,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-sm)",
                  color: "var(--fg)",
                  resize: "none",
                  outline: "none",
                }}
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleSend}
                disabled={busy || !input.trim()}
              >
                {busy ? "처리 중…" : "전송"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
