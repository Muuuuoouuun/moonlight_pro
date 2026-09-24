"use client";

import React, { useState, useEffect, useRef } from "react";
import { Badge, Button, IconButton, Dot } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "./esc-layers";
import { requestCouncilAdvice } from "./council-client";
import { requestGuruCoaching } from "./guru-client";
import { requestPersonaChat, LEGEND_LENS_MAP } from "./persona-client";
import { createAdviceTaskWriter } from "@/lib/ai-workflow-client";

function renderAdviceWithCallouts(text) {
  if (!text || typeof text !== "string") return null;
  if (!text.includes("💡") && !text.includes("실전 팁")) {
    return <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.65 }}>{text}</div>;
  }

  const lines = text.split("\n");
  const blocks = [];
  let currentNormal = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTip = /^(?:[-*•]\s*)?(?:💡|\[?(?:거장의\s*)?실전\s*팁\]?)/i.test(line.trim());

    if (isTip) {
      if (currentNormal.length > 0) {
        blocks.push({ type: "normal", text: currentNormal.join("\n") });
        currentNormal = [];
      }
      blocks.push({ type: "tip", text: line.trim() });
    } else {
      currentNormal.push(line);
    }
  }
  if (currentNormal.length > 0) {
    blocks.push({ type: "normal", text: currentNormal.join("\n") });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, lineHeight: 1.65 }}>
      {blocks.map((b, idx) => {
        if (b.type === "tip") {
          return (
            <div
              key={idx}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--moon-line)",
                boxShadow: "inset 2px 0 0 var(--moon-500)",
                borderRadius: "var(--r)",
                padding: "8px 12px",
                fontSize: 12,
                color: "var(--fg)",
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--moon-200)" }}>💡 거장의 실전 팁</span>
              </div>
              <div>{b.text.replace(/^[-*•]\s*/, "")}</div>
            </div>
          );
        }
        return (
          <div key={idx} style={{ whiteSpace: "pre-wrap" }}>
            {b.text}
          </div>
        );
      })}
    </div>
  );
}

export function FloatingMentorWidget({
  isOpen = false,
  onClose,
  agent, // 'council' | 'guru' (optional, auto-inferred if omitted)
  guidanceId = null,
  initialQuestion = "",
  contextType = "content", // 'content' | 'project' | 'deal' | 'customer' | 'sales' | 'weekly' | 'general'
  contextTitle = "",
  contextData = {},
  initialTab = "quick",
  onApplyText,
  onCreateTask,
}) {
  const isGuru = agent ? agent === "guru" : ["deal", "customer", "sales"].includes(contextType);
  const contextKey = JSON.stringify([agent, contextType, contextData?.id || contextData?.ref || contextTitle, guidanceId, initialQuestion]);
  const [minimized, setMinimized] = useState(false);
  const defaultTab = initialTab || (contextData?.mode === "critique" ? "critique" : "quick");
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedLens, setSelectedLens] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [chatThread, setChatThread] = useState([]);
  const [chatInput, setChatInput] = useState(initialQuestion);
  const [adviceHistory, setAdviceHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const visibleAdviceHistory = adviceHistory.filter(item => item.contextKey === contextKey);
  const [taskSaved, setTaskSaved] = useState(false);
  const [dealSaved, setDealSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [dealSaving, setDealSaving] = useState(false);
  const taskWriter = useRef(null);
  if (!taskWriter.current) taskWriter.current = createAdviceTaskWriter();
  const taskPending = useRef(false);
  const dealPending = useRef(false);
  const requestEpoch = useRef(0);
  const requestPending = useRef(false);
  useEffect(() => {
    requestEpoch.current += 1;
    requestPending.current = false;
    setResultText("");
    setChatThread([]);
    setChatInput(initialQuestion);
    setStatusNote("");
    setTaskSaved(false);
    setDealSaved(false);
    setLoading(false);
  }, [contextKey]);
  useEffect(() => () => { requestEpoch.current += 1; }, []);

  // Esc key layer registration
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const layer = pushEscLayer();
    const onKey = (e) => {
      if (e.key === "Escape" && isTopEscLayer(layer)) {
        onCloseRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popEscLayer(layer);
    };
  }, [isOpen]);

  // Context summary text for prompts
  const buildContextPrompt = (userPrompt = "") => {
    const parts = [];
    if (isGuru) {
      parts.push(`[현재 딜 / 영업 맥락]`);
      if (contextData?.name || contextData?.title || contextTitle) {
        parts.push(`딜/고객: ${contextData?.name || contextData?.title || contextTitle}`);
      }
      if (contextData?.company) parts.push(`회사/소속: ${contextData.company}`);
      if (contextData?.stage || contextData?.amount) {
        parts.push(`단계/규모: ${contextData.stage || ""} ${contextData.amount ? `· ${contextData.amount}` : ""}`);
      }
      if (contextData?.nextAction) parts.push(`다음 행동: ${contextData.nextAction}`);
      if (contextData?.reason) parts.push(`판단 사유: ${contextData.reason}`);
      if (contextData?.lastTouch) parts.push(`최근 접촉: ${contextData.lastTouch}`);
      if (contextData?.notes) parts.push(`관련 메모:\n${contextData.notes}`);
    } else if (contextType === "weekly") {
      parts.push(`[한 주 정리 및 회고 맥락]`);
      parts.push(`주간 타이틀: ${contextTitle || "이번 주 운영 회고"}`);
      if (contextData?.summary) parts.push(`주간 요약:\n${contextData.summary}`);
    } else if (contextType === "content") {
      parts.push(`[현재 컨텐츠 초안]`);
      if (contextData?.title) parts.push(`제목: ${contextData.title}`);
      if (contextData?.brand) parts.push(`브랜드: ${contextData.brand}`);
      if (contextData?.body) parts.push(`본문 초안:\n${contextData.body}`);
    } else if (contextType === "project") {
      parts.push(`[현재 프로젝트 맥락]`);
      if (contextData?.title) parts.push(`프로젝트명: ${contextData.title}`);
      if (contextData?.status) parts.push(`진행상태: ${contextData.status}`);
      if (contextData?.desc) parts.push(`목표/설명: ${contextData.desc}`);
      if (Array.isArray(contextData?.todos) && contextData.todos.length) {
        parts.push(`체크리스트:\n${contextData.todos.map(t => `- [${t.done ? 'x' : ' '}] ${t.title}`).join('\n')}`);
      }
      if (Array.isArray(contextData?.updates) && contextData.updates.length) {
        parts.push(`최근 업데이트: ${contextData.updates.slice(0, 3).map(u => u.title).join(' / ')}`);
      }
    }
    if (selectedLens && LEGEND_LENS_MAP[selectedLens]) {
      parts.push(`[적용 렌즈: ${LEGEND_LENS_MAP[selectedLens].name} 관점 적용]`);
    }
    if (userPrompt) {
      parts.push(`\n[운영자 요청/질문]:\n${userPrompt}`);
    }
    return parts.join("\n\n");
  };

  // Run advice, critique, sparring, or weekly-review
  const handleRequest = async (mode, customDraft = "") => {
    if (requestPending.current) return;
    requestPending.current = true;
    const epoch = requestEpoch.current;
    setLoading(true);
    setStatusNote("");
    setTaskSaved(false);
    setDealSaved(false);
    const draft = buildContextPrompt(customDraft);
    const ref = contextData?.id || contextData?.ref || contextData?.title || contextData?.name || null;

    // Use persona-chat when lens is selected or in critique / weekly-review / outreach / extract-actions mode
    let res;
    if (selectedLens || mode === "critique" || mode === "weekly-review" || mode === "outreach-draft" || mode === "extract-actions" || mode === "daily-dispatch") {
      res = await requestPersonaChat({
        personaId: isGuru ? "sales" : contextType === "content" ? "content" : mode === "extract-actions" ? "order" : "council",
        mode,
        lens: selectedLens,
        draft,
        message: customDraft || null,
        context: contextData,
      });
    } else {
      res = isGuru
        ? await requestGuruCoaching({ mode, draft, ref, guidanceId })
        : await requestCouncilAdvice({ mode, draft, ref });
    }

    if (epoch !== requestEpoch.current) return;
    requestPending.current = false;
    setLoading(false);
    if (res.state === "done") {
      setResultText(res.text);
      setAdviceHistory((prev) => [
        {
          id: Date.now(),
          at: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
          title: contextTitle || mode,
          text: res.text,
          mode,
          contextKey,
        },
        ...prev.slice(0, 4),
      ]);
    } else if (res.state === "preview") {
      setStatusNote(res.note || "Engine이 연결되지 않은 preview 상태입니다.");
    } else {
      setStatusNote(res.note || "조언을 불러오지 못했습니다.");
    }
  };

  // Run chat message
  const handleSendChat = async (e) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || requestPending.current) return;
    requestPending.current = true;
    const epoch = requestEpoch.current;

    const newThread = [...chatThread, { role: "user", text }];
    setChatThread(newThread);
    setChatInput("");
    setLoading(true);
    setStatusNote("");
    setTaskSaved(false);
    setDealSaved(false);

    const draft = buildContextPrompt(
      `이전 대화:\n${chatThread.map(m => `${m.role === 'user' ? '운영자' : isGuru ? 'Guru' : 'Council'}: ${m.text}`).join('\n')}\n\n새 질문:\n${text}`
    );
    const ref = contextData?.id || contextData?.ref || contextData?.title || contextData?.name || null;

    const chatMode = activeTab === "critique" ? "critique" : activeTab === "sparring" ? "sparring" : "chat";
    let res;
    if (selectedLens) {
      res = await requestPersonaChat({
        personaId: isGuru ? "sales" : "council",
        mode: chatMode,
        lens: selectedLens,
        draft,
        message: text,
      });
    } else {
      res = isGuru
        ? await requestGuruCoaching({
            mode: activeTab === "sparring" ? "sparring" : "deal-review",
            draft,
            ref,
            guidanceId,
          })
        : await requestCouncilAdvice({
            mode: activeTab === "sparring" ? "sparring" : "brand-strategy",
            draft,
            ref,
          });
    }

    if (epoch !== requestEpoch.current) return;
    requestPending.current = false;
    setLoading(false);

    if (res.state === "done") {
      setChatThread([...newThread, { role: isGuru ? "guru" : "council", text: res.text }]);
    } else {
      setChatThread([...newThread, { role: isGuru ? "guru" : "council", state: "error", text: res.note || "응답을 생성하지 못했습니다." }]);
    }
  };

  const handleCopy = async () => {
    const textToCopy = activeTab === "chat"
      ? chatThread.slice(-1)[0]?.text || ""
      : resultText;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatusNote("복사하지 못했습니다. 본문을 선택해 복사하세요.");
    }
  };

  const extractTaskTitle = (taskText) => {
    if (!taskText) return "";
    const expMatch = taskText.match(/📌\s*다음\s*주\s*단\s*1가지\s*실험:\s*([^\n\r]+)/);
    if (expMatch && expMatch[1]?.trim()) {
      return "다음 주 실험: " + expMatch[1].trim().replace(/^\[|\]$/g, "");
    }
    const taskMatch = taskText.match(/📌\s*추천\s*태스크:\s*([^\n\r]+)/);
    if (taskMatch && taskMatch[1]?.trim()) {
      return taskMatch[1].trim().replace(/^\[|\]$/g, "");
    }
    const firstLine = taskText.split("\n")[0].replace(/^[0-9\.\-\*\s🟢🔴🟡💡🎯📋#]+/, "").trim().slice(0, 80);
    return firstLine || (isGuru ? "Guru 코칭 실행" : contextType === "weekly" ? "다음 주 운영 실험" : "Council 조언 실행");
  };

  const handleCreateTask = async (taskText) => {
    if (!taskText || taskPending.current) return;
    const title = extractTaskTitle(taskText);
    const epoch = requestEpoch.current;
    taskPending.current = true;
    setTaskSaving(true);
    try {
      if (onCreateTask) {
        await onCreateTask(title);
        if (epoch === requestEpoch.current) setStatusNote("할 일 초안을 열었습니다. 내용을 확인하고 저장하세요.");
        return;
      }
      const result = await taskWriter.current.save({
        key: `${contextKey}:${taskText}`,
        title,
        projectId: contextType === "project" ? contextData?.id || null : null,
        dealId: contextType === "deal" ? contextData?.id || null : null,
      });
      if (epoch !== requestEpoch.current) return;
      if (result.state === "saved") setTaskSaved(true);
      else setStatusNote(result.note);
    } catch {
      if (epoch === requestEpoch.current) setStatusNote("할 일 초안을 열지 못했습니다. 다시 시도하세요.");
    } finally {
      taskPending.current = false;
      setTaskSaving(false);
    }
  };

  const handleUpdateDealNextAction = async (taskText) => {
    if (!contextData?.id || !taskText || dealPending.current) return;
    const epoch = requestEpoch.current;
    dealPending.current = true;
    setDealSaving(true);
    const nextAction = extractTaskTitle(taskText);
    try {
      const res = await fetch("/api/hub/revenue/deal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "update",
          id: contextData.id,
          nextAction,
        }),
      });
      const data = await res.json().catch(() => null);
      if (epoch !== requestEpoch.current) return;
      if (res.ok && data?.status === "saved") {
        setDealSaved(true);
      } else setStatusNote("딜 다음 행동이 저장되지 않았습니다. 연결 상태를 확인한 뒤 다시 시도하세요.");
    } catch {
      if (epoch === requestEpoch.current) setStatusNote("딜 저장 응답을 받지 못했습니다. 다시 시도하세요.");
    } finally {
      dealPending.current = false;
      setDealSaving(false);
    }
  };

  if (!isOpen) return null;

  // Minimized dock pill
  if (minimized) {
    return (
      <aside
        aria-label={`${isGuru ? "Guru" : "Council"} 최소화 위젯`}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: "var(--z-drawer, 90)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "var(--surface-2)",
          border: "1px solid var(--line-strong)",
          borderRadius: 999,
          boxShadow: "var(--shadow-pop)",
          cursor: "pointer",
        }}
        onClick={() => setMinimized(false)}
      >
        <Iconed name={isGuru ? "deals" : "council"} size={16} style={{ color: "var(--moon-300)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>
          {isGuru ? "Sales Guru" : "Council Co-Pilot"}
        </span>
        <Badge tone="moon" size="xs">{contextTitle || contextType}</Badge>
        <IconButton icon="plus" iconSize={14} aria-label="열기" onClick={(e) => { e.stopPropagation(); setMinimized(false); }} />
      </aside>
    );
  }

  const getPromptPresets = () => {
    if (isGuru) {
      return [
        "부담 없는 안부 카톡 초안 써줘",
        "고객 거절을 어떻게 돌파할까?",
        "이 딜의 치명적 맹점 1가지는?",
      ];
    }
    if (contextType === "weekly") {
      return [
        "이번 주 가장 아쉬운 점과 극복책은?",
        "다음 주 최우선 집중 과제 1개는?",
      ];
    }
    if (contextType === "content") {
      return [
        "첫 문장을 더 후킹하게 고쳐줘",
        "고객 입장에서 지루한 부분은?",
        "간결하게 3줄 요약해줘",
      ];
    }
    return [
      "지금 당장 실행할 1가지 행동은?",
      "놓치고 있는 리스크는 무엇인가?",
      "핵심 액션 아이템만 3개 추려줘",
    ];
  };

  const quickOptions = isGuru
    ? [
        { label: "카톡/문자 연락 초안", mode: "outreach-draft" },
        { label: "딜 진단 (Keenan 4층)", mode: "deal-review" },
        { label: "파이프라인 우선순위", mode: "pipeline-triage" },
        { label: "제안 검토", mode: "proposal-critique" },
      ]
    : contextType === "weekly"
    ? [
        { label: "한 주 사실 요약", mode: "weekly-review" },
        { label: "병목 타파 진단", mode: "flow-review" },
      ]
    : contextType === "content"
    ? [
        { label: "카피 진단 (Ogilvy)", mode: "content-critique" },
        { label: "오디언스 가설", mode: "audience-analysis" },
        { label: "플로우 점검", mode: "flow-review" },
      ]
    : contextType === "project"
    ? [
        { label: "액션 아이템 추출", mode: "extract-actions" },
        { label: "병목 타파 진단 (Goldratt)", mode: "flow-review" },
        { label: "우선순위 전략", mode: "brand-strategy" },
      ]
    : [
        { label: "병목 타파 진단 (Goldratt)", mode: "flow-review" },
        { label: "우선순위 전략", mode: "brand-strategy" },
        { label: "액션 아이템 추출", mode: "extract-actions" },
        { label: "메모/회의 정리", mode: "meeting-synthesis" },
      ];

  const widgetTitle = isGuru ? "Guru 세일즈 코칭" : contextType === "weekly" ? "주간 정리 & Council" : "Council 자문단";
  const contextPrefix = isGuru
    ? "고객/딜: "
    : contextType === "weekly"
    ? "주간: "
    : contextType === "project"
    ? "프로젝트: "
    : contextType === "content"
    ? "콘텐츠: "
    : "맥락: ";

  return (
    <aside
      aria-label={`${widgetTitle} 코파일럿 팝업`}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 440,
        maxHeight: "82vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-pop)",
        zIndex: "var(--z-drawer, 90)",
        overflow: "hidden",
      }}
    >
      {/* 1. Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--line-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface-2)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Iconed name={isGuru ? "deals" : "council"} size={15} style={{ color: "var(--moon-300)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap" }}>
            {widgetTitle}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--fg-muted)",
              background: "var(--surface-3)",
              padding: "2px 6px",
              borderRadius: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 160,
            }}
            title={contextTitle}
          >
            {contextPrefix}
            {contextTitle || "작업 중"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {visibleAdviceHistory.length > 0 && (
            <IconButton
              icon="clock"
              iconSize={13}
              aria-label="최근 조언 기록"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((prev) => !prev)}
            />
          )}
          <IconButton icon="chevronD" iconSize={13} aria-label="최소화" onClick={() => setMinimized(true)} />
          <IconButton icon="x" iconSize={13} aria-label="닫기" onClick={onClose} />
        </div>
      </div>

      {/* 1.5 Recent Advice History Dropdown */}
      {showHistory && visibleAdviceHistory.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--surface-3)",
            borderBottom: "1px solid var(--line)",
            maxHeight: 140,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--fg-faint)", fontSize: 10.5 }}>
            <span>최근 조언 내역 ({visibleAdviceHistory.length}건)</span>
            <button
              onClick={() => setShowHistory(false)}
              style={{ background: "none", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 10.5 }}
            >
              닫기
            </button>
          </div>
          {visibleAdviceHistory.map((item) => (
            <button
              type="button"
              className="hub-row"
              key={item.id}
              onClick={() => {
                setResultText(item.text);
                setTaskSaved(false);
                setDealSaved(false);
                setShowHistory(false);
                if (activeTab === "chat") setActiveTab("quick");
              }}
              style={{
                padding: "4px 8px",
                background: "var(--surface-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-xs)",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg)", flex: 1 }}>
                {item.title || item.mode}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-faint)", flexShrink: 0 }}>{item.at}</span>
            </button>
          ))}
        </div>
      )}

      {/* 2. Mode Selector Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          background: "var(--surface)",
          borderBottom: "1px solid var(--line-soft)",
          padding: "4px 8px",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {[
          { key: "quick", label: "⚡ 조언" },
          { key: "critique", label: "🔍 평가" },
          { key: "sparring", label: "⚖️ 토의" },
          { key: "chat", label: "💬 대화" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "critique" && !resultText) {
                  handleRequest("critique");
                } else if (tab.key === "sparring" && !resultText) {
                  handleRequest("sparring");
                }
              }}
              style={{
                height: 28,
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--moon-100)" : "var(--fg-muted)",
                background: active ? "var(--surface-3)" : "transparent",
                border: active ? "1px solid var(--line)" : "1px solid transparent",
                borderRadius: "var(--r-sm)",
                cursor: "pointer",
                transition: "color var(--dur-hover) var(--ease-hub)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 2.5 Legend Lens Switcher Bar */}
      <div
        style={{
          padding: "4px 10px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--line-soft)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflowX: "auto",
          fontSize: 10.5,
          color: "var(--fg-faint)",
          flexShrink: 0,
        }}
      >
        <span style={{ whiteSpace: "nowrap" }}>관점:</span>
        <button
          onClick={() => setSelectedLens(null)}
          style={{
            padding: "2px 6px",
            borderRadius: "var(--r-xs)",
            border: selectedLens === null ? "1px solid var(--line-strong)" : "1px solid transparent",
            background: selectedLens === null ? "var(--surface-3)" : "transparent",
            color: selectedLens === null ? "var(--fg)" : "var(--fg-muted)",
            fontSize: 10.5,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          기본
        </button>
        {["jobs", "bezos", "chouinard", "voss", "ogilvy", "carnegie", "hill"].map((lid) => {
          const l = LEGEND_LENS_MAP[lid];
          const active = selectedLens === lid;
          return (
            <button
              key={lid}
              onClick={() => setSelectedLens(active ? null : lid)}
              style={{
                padding: "2px 6px",
                borderRadius: "var(--r-xs)",
                border: active ? "1px solid var(--moon-line)" : "1px solid transparent",
                background: active ? "var(--surface-3)" : "transparent",
                color: active ? "var(--moon-200)" : "var(--fg-muted)",
                fontSize: 10.5,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title={l.label}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      {/* 3. Sub-Action / Presets */}
      {activeTab === "critique" && (
        <div
          style={{
            padding: "6px 12px",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            background: "var(--surface-2)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
            맹점, 비약, 고객 거절 리스크를 냉철하게 점검합니다.
          </span>
          <Button
            variant="outline"
            size="xs"
            icon="sparkle"
            disabled={loading}
            onClick={() => handleRequest("critique")}
          >
            {loading ? "평가 중…" : "냉철 평가 재실행"}
          </Button>
        </div>
      )}
      {activeTab === "quick" && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            gap: 6,
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {quickOptions.map((opt) => (
            <Button
              key={opt.mode}
              variant="outline"
              size="xs"
              disabled={loading}
              onClick={() => handleRequest(opt.mode)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {activeTab === "sparring" && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--line-soft)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
            {isGuru
              ? "추진 논거(Cardone/Belfort) vs 거절 맹점(Voss/Ziglar) vs 다음 한 수"
              : "찬성(추진) vs 비판(Devil's Advocate) vs 실행안"}
          </div>
          <Button
            variant="primary"
            size="xs"
            icon="sparkle"
            disabled={loading}
            onClick={() => handleRequest("sparring")}
          >
            {loading ? "토론 진행 중…" : "3자 토론 소집"}
          </Button>
        </div>
      )}

      {/* 4. Main Scrollable Content */}
      <div
        className="scroll-y"
        style={{
          flex: 1,
          padding: 14,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--fg)",
          overflowY: "auto",
        }}
      >
        {activeTab === "chat" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {chatThread.length === 0 ? (
              <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12 }}>
                현재 화면의 맥락을 알고 있습니다.<br />
                궁금한 점이나 질문을 남기세요.
              </div>
            ) : (
              chatThread.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    padding: "8px 12px",
                    borderRadius: "var(--r-md)",
                    background: msg.role === "user" ? "var(--surface-3)" : "var(--surface-2)",
                    border: `1px solid ${msg.role === "user" ? "var(--line-strong)" : "var(--line)"}`,
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  <div style={{ fontSize: 10.5, color: "var(--fg-faint)", marginBottom: 3 }}>
                    {msg.role === "user" ? "운영자" : isGuru ? "Guru" : "Council"}
                  </div>
                  {msg.role === "user" ? msg.text : renderAdviceWithCallouts(msg.text)}
                </div>
              ))
            )}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)", fontSize: 11 }}>
                <Dot tone="moon" size={6} />
                {isGuru ? "Guru가 영업 데이터를 분석하고 있습니다…" : "Council이 맥락을 분석하고 있습니다…"}
              </div>
            )}
          </div>
        ) : (
          <div>
            {loading ? (
              <div style={{ padding: "40px 10px", textAlign: "center", color: "var(--fg-muted)" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <Dot tone="moon" size={8} />
                  {isGuru ? "Guru 코칭을 생성하는 중입니다…" : "Council 조언을 생성하는 중입니다…"}
                </div>
              </div>
            ) : resultText ? (
              renderAdviceWithCallouts(resultText)
            ) : (
              <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12 }}>
                {statusNote || (
                  activeTab === "sparring"
                    ? "우측 상단의 [3자 토론 소집]을 누르면 상반된 시각의 맹점 검증을 시작합니다."
                    : "위의 조언 항목을 선택하여 현재 맥락의 진단을 받으세요."
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Action Bar (Apply to draft / Add as task / Copy) */}
      {(activeTab === "chat" ? chatThread.length > 0 && chatThread.at(-1)?.state !== "error" : resultText) && !loading && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {contextType === "content" && onApplyText && (
              <Button
                variant="primary"
                size="xs"
                icon="check"
                onClick={() => {
                  const txt = activeTab === "chat"
                    ? chatThread.slice(-1)[0]?.text || ""
                    : resultText;
                  if (txt) onApplyText(txt);
                }}
              >
                초안에 적용
              </Button>
            )}
            <Button
              variant="outline"
              size="xs"
              icon={taskSaved ? "check" : "plus"}
              disabled={taskSaved || taskSaving}
              onClick={() => {
                const txt = activeTab === "chat"
                  ? chatThread.slice(-1)[0]?.text || ""
                  : resultText;
                handleCreateTask(txt);
              }}
            >
              {taskSaving ? "저장 확인 중…" : taskSaved ? "태스크 등록됨 ✓" : onCreateTask ? "할 일 초안 열기" : contextType === "weekly" ? "📌 실험 태스크 등록" : "할 일로 등록"}
            </Button>
            {contextType === "deal" && contextData?.id && (
              <Button
                variant="outline"
                size="xs"
                icon={dealSaved ? "check" : "deals"}
                disabled={dealSaved || dealSaving}
                onClick={() => {
                  const txt = activeTab === "chat"
                    ? chatThread.slice(-1)[0]?.text || ""
                    : resultText;
                  handleUpdateDealNextAction(txt);
                }}
              >
                {dealSaving ? "저장 확인 중…" : dealSaved ? "다음 행동 저장됨 ✓" : "딜 다음 행동 반영"}
              </Button>
            )}
          </div>
          <Button variant="ghost" size="xs" icon={copied ? "check" : "copy"} onClick={handleCopy}>
            {copied ? "복사됨 ✓" : "복사"}
          </Button>
        </div>
      )}

      {/* 5.5 Chat Prompt Presets */}
      {activeTab === "chat" && (
        <div
          style={{
            padding: "4px 10px",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--line-soft)",
            display: "flex",
            gap: 6,
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {getPromptPresets().map((preset, idx) => (
            <button
              key={idx}
              type="button"
              className="hub-row"
              disabled={loading}
              onClick={() => {
                setChatInput(preset);
              }}
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid var(--line)",
                background: "var(--surface-3)",
                color: "var(--fg-muted)",
                fontSize: 10.5,
                whiteSpace: "nowrap",
                cursor: "pointer",
                transition: "color var(--dur-hover) var(--ease-hub)",
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {/* 6. Chat Input Field */}
      {activeTab === "chat" && (
        <form
          onSubmit={handleSendChat}
          style={{
            padding: "8px 12px",
            background: "var(--surface)",
            borderTop: "1px solid var(--line-soft)",
            display: "flex",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={isGuru ? "딜/고객 관련 질문 또는 반론 다듬기 요청…" : "맥락 바탕으로 질문 또는 수정 요청…"}
            disabled={loading}
            style={{
              flex: 1,
              height: 30,
              padding: "0 10px",
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              color: "var(--fg)",
              fontSize: 11.5,
              outline: "none",
            }}
          />
          <Button variant="primary" size="xs" icon="send" disabled={!chatInput.trim() || loading}>
            전송
          </Button>
        </form>
      )}
    </aside>
  );
}
