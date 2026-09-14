"use client";

import React, { useState, useEffect, useRef } from "react";
import { Badge, Button, IconButton, Dot } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "./esc-layers";
import { requestCouncilAdvice } from "./council-client";

export function FloatingMentorWidget({
  isOpen = false,
  onClose,
  contextType = "content", // 'content' | 'project' | 'general'
  contextTitle = "",
  contextData = {},
  onApplyText,
  onCreateTask,
}) {
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState("quick"); // 'quick' | 'sparring' | 'chat'
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [chatThread, setChatThread] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [taskSaved, setTaskSaved] = useState(false);
  const [copied, setCopied] = useState(false);

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
    if (contextType === "content") {
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
    if (userPrompt) {
      parts.push(`\n[운영자 요청/질문]:\n${userPrompt}`);
    }
    return parts.join("\n\n");
  };

  // Run advice or sparring
  const handleRequest = async (mode, customDraft = "") => {
    setLoading(true);
    setStatusNote("");
    setTaskSaved(false);
    const draft = buildContextPrompt(customDraft);
    const res = await requestCouncilAdvice({
      mode,
      draft,
      ref: contextData?.id || contextData?.title || null,
    });
    setLoading(false);
    if (res.state === "done") {
      setResultText(res.text);
    } else if (res.state === "preview") {
      setStatusNote(res.note || "Engine이 연결되지 않은 preview 상태입니다.");
    } else {
      setStatusNote(res.note || "자문을 불러오지 못했습니다.");
    }
  };

  // Run chat message
  const handleSendChat = async (e) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || loading) return;

    const newThread = [...chatThread, { role: "user", text }];
    setChatThread(newThread);
    setChatInput("");
    setLoading(true);
    setStatusNote("");

    const draft = buildContextPrompt(
      `이전 대화:\n${chatThread.map(m => `${m.role === 'user' ? '운영자' : 'Council'}: ${m.text}`).join('\n')}\n\n새 질문:\n${text}`
    );

    const res = await requestCouncilAdvice({
      mode: activeTab === "sparring" ? "sparring" : "brand-strategy",
      draft,
      ref: contextData?.id || contextData?.title || null,
    });
    setLoading(false);

    if (res.state === "done") {
      setChatThread([...newThread, { role: "council", text: res.text }]);
    } else {
      setChatThread([...newThread, { role: "council", text: res.note || "응답을 생성하지 못했습니다." }]);
    }
  };

  const handleCopy = () => {
    const textToCopy = activeTab === "chat"
      ? chatThread.slice(-1)[0]?.text || ""
      : resultText;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateTask = async (taskText) => {
    if (!taskText) return;
    const firstLine = taskText.split("\n")[0].replace(/^[0-9\.\-\*\s🟢🔴🟡]+/, "").trim().slice(0, 80);
    const title = firstLine || "Council 조언 실행";

    if (onCreateTask) {
      onCreateTask(title);
      setTaskSaved(true);
      return;
    }

    try {
      const res = await fetch("/api/hub/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          project_id: contextData?.id || null,
        }),
      });
      if (res.ok) {
        setTaskSaved(true);
      }
    } catch (e) {
      console.error("Failed to create task", e);
    }
  };

  if (!isOpen) return null;

  // Minimized dock pill
  if (minimized) {
    return (
      <aside
        aria-label="Council Co-Pilot 최소화 위젯"
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
          boxShadow: "0 8px 24px oklch(0 0 0 / 0.4)",
          cursor: "pointer",
        }}
        onClick={() => setMinimized(false)}
      >
        <Iconed name="council" size={16} style={{ color: "var(--moon-300)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>Council Co-Pilot</span>
        <Badge tone="moon" size="xs">{contextTitle || contextType}</Badge>
        <IconButton name="plus" size={14} label="열기" onClick={(e) => { e.stopPropagation(); setMinimized(false); }} />
      </aside>
    );
  }

  const quickOptions = contextType === "content"
    ? [
        { label: "카피 진단 (Ogilvy)", mode: "content-critique" },
        { label: "오디언스 가설", mode: "audience-analysis" },
        { label: "플로우 점검", mode: "flow-review" },
      ]
    : [
        { label: "병목 타파 진단 (Goldratt)", mode: "flow-review" },
        { label: "우선순위 전략", mode: "brand-strategy" },
        { label: "회의/메모 정리", mode: "meeting-synthesis" },
      ];

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Council Co-Pilot 위젯"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: "min(440px, calc(100vw - 32px))",
        height: "min(580px, calc(100vh - 40px))",
        zIndex: "var(--z-drawer, 90)",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--r-lg)",
        boxShadow: "0 16px 40px oklch(0 0 0 / 0.5), 0 2px 8px oklch(0 0 0 / 0.3)",
        backdropFilter: "blur(16px)",
        overflow: "hidden",
      }}
    >
      {/* 1. Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Iconed name="council" size={15} style={{ color: "var(--moon-300)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap" }}>
            Council Co-Pilot
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
            {contextType === "content" ? "컨텐츠: " : "프로젝트: "}
            {contextTitle || "작업 중"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconButton name="arrowDown" size={13} label="최소화" onClick={() => setMinimized(true)} />
          <IconButton name="x" size={13} label="닫기" onClick={onClose} />
        </div>
      </div>

      {/* 2. Mode Selector Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          background: "var(--surface)",
          borderBottom: "1px solid var(--line-soft)",
          padding: "4px 8px",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {[
          { key: "quick", label: "⚡ 빠른 조언" },
          { key: "sparring", label: "⚖️ 3자 토론" },
          { key: "chat", label: "💬 대화" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                height: 28,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--moon-100)" : "var(--fg-muted)",
                background: active ? "var(--surface-3)" : "transparent",
                border: active ? "1px solid var(--line)" : "1px solid transparent",
                borderRadius: "var(--r-sm)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 3. Sub-Action / Presets */}
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
            찬성(추진) vs 비판(Devil's Advocate) vs 실행안
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
                궁금한 점이나 수정을 요청하세요.
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
                  <div style={{ fontSize: 10, color: "var(--fg-faint)", marginBottom: 3 }}>
                    {msg.role === "user" ? "운영자" : "Council"}
                  </div>
                  {msg.text}
                </div>
              ))
            )}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)", fontSize: 11 }}>
                <Dot tone="moon" size={6} />
                Council이 맥락을 분석하고 있습니다…
              </div>
            )}
          </div>
        ) : (
          <div>
            {loading ? (
              <div style={{ padding: "40px 10px", textAlign: "center", color: "var(--fg-muted)" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <Dot tone="moon" size={8} />
                  Council 조언을 생성하는 중입니다…
                </div>
              </div>
            ) : resultText ? (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.65 }}>
                {resultText}
              </div>
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
      {(resultText || (activeTab === "chat" && chatThread.length > 0)) && !loading && (
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
              disabled={taskSaved}
              onClick={() => {
                const txt = activeTab === "chat"
                  ? chatThread.slice(-1)[0]?.text || ""
                  : resultText;
                handleCreateTask(txt);
              }}
            >
              {taskSaved ? "할 일 등록됨" : "할 일로 등록"}
            </Button>
          </div>
          <Button variant="ghost" size="xs" icon={copied ? "check" : "copy"} onClick={handleCopy}>
            {copied ? "복사됨" : "복사"}
          </Button>
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
            placeholder="맥락 바탕으로 질문 또는 수정 요청…"
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
