"use client";

import { useEffect, useRef, useState } from "react";

import {
  AI_TARGETS,
  buildAiThreadTitle,
  getAiTargetLabel,
  normalizeAiTarget,
} from "@/lib/ai-console";

function getAuthorTone(author) {
  if (author === "claude") return "blue";
  if (author === "codex") return "green";
  if (author === "operator") return "warning";
  if (author === "engine") return "muted";
  return "muted";
}

export function AiChatWorkspace({
  initialThreads,
  initialMessages,
  initialSuggestions,
  initialAgents,
  initialDraft = null,
}) {
  const [threads, setThreads] = useState(initialThreads || []);
  const [messagesByThread, setMessagesByThread] = useState(() =>
    Object.fromEntries(
      (initialThreads || []).map((thread, index) => [thread.id, index === 0 ? initialMessages : []]),
    ),
  );
  const [activeThreadId, setActiveThreadId] = useState(initialThreads?.[0]?.id || null);
  const [target, setTarget] = useState(normalizeAiTarget(initialThreads?.[0]?.target));
  const [composer, setComposer] = useState("");
  const [drafts, setDrafts] = useState({});
  const [pending, setPending] = useState(false);
  const [activityNote, setActivityNote] = useState(
    "이제 실제 API 호출 기반입니다. 스레드 선택, 초안 저장, 전송 결과가 이 화면과 /api/ai/chat 응답을 같이 거칩니다.",
  );
  const appliedDraftSignatureRef = useRef("");

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || null;
  const activeMessages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];

  useEffect(() => {
    const signature = JSON.stringify(initialDraft || null);

    if (!initialDraft || appliedDraftSignatureRef.current === signature) {
      return;
    }

    appliedDraftSignatureRef.current = signature;

    const prefillBody = String(initialDraft.body || "").trim();
    const prefillTarget = normalizeAiTarget(initialDraft.target);
    const threadId = `prefill-thread-${Date.now()}`;
    const title = initialDraft.title || buildAiThreadTitle(prefillBody || initialDraft.source || "상황실 초안");

    const nextThread = {
      id: threadId,
      title,
      target: getAiTargetLabel(prefillTarget),
      updated: "방금",
      preview: prefillBody || "상황실에서 넘어온 초안이 준비되었습니다.",
      unread: 0,
      status: "draft",
    };

    setThreads((current) => [nextThread, ...current.filter((thread) => thread.id !== threadId)]);
    setMessagesByThread((current) => ({ ...current, [threadId]: [] }));
    setDrafts((current) => ({ ...current, [threadId]: prefillBody }));
    setActiveThreadId(threadId);
    setTarget(prefillTarget);
    setComposer(prefillBody);
    setActivityNote(
      initialDraft.source
        ? `"${initialDraft.source}" 에서 넘어온 챗 초안을 열었습니다. 내용 확인 후 바로 보내면 됩니다.`
        : "외부에서 넘어온 챗 초안을 열었습니다. 내용 확인 후 바로 보내면 됩니다.",
    );
  }, [initialDraft]);

  function handleSelectThread(thread) {
    setActiveThreadId(thread.id);
    setTarget(normalizeAiTarget(thread.target));
    setComposer(drafts[thread.id] || "");
    setThreads((current) =>
      current.map((item) => (item.id === thread.id ? { ...item, unread: 0 } : item)),
    );
    setActivityNote(`"${thread.title}" 스레드를 열었습니다. 저장된 초안이 있으면 컴포저에 다시 붙습니다.`);
  }

  function handleNewThread() {
    const id = `local-thread-${Date.now()}`;
    const nextThread = {
      id,
      title: "새 스레드",
      target: getAiTargetLabel(target),
      updated: "방금",
      preview: "메시지를 입력해 새 대화를 시작하세요.",
      unread: 0,
      status: "draft",
    };

    setThreads((current) => [nextThread, ...current]);
    setMessagesByThread((current) => ({ ...current, [id]: [] }));
    setDrafts((current) => ({ ...current, [id]: "" }));
    setActiveThreadId(id);
    setComposer("");
    setActivityNote("새 스레드를 열었습니다. 첫 메시지를 보내면 실제 API 응답으로 제목과 스트림이 채워집니다.");
  }

  function handleSaveDraft() {
    if (!activeThreadId) {
      return;
    }

    setDrafts((current) => ({ ...current, [activeThreadId]: composer }));
    setActivityNote(
      composer.trim()
        ? "현재 컴포저 내용을 스레드 초안으로 저장했습니다."
        : "비어 있는 초안 상태를 저장했습니다. 다음에 다시 열면 그대로 복원됩니다.",
    );
  }

  async function handleSend() {
    if (!activeThreadId || !composer.trim()) {
      return;
    }

    const previousThreadId = activeThreadId;
    const trimmed = composer.trim();
    const persistedThreadId =
      previousThreadId.startsWith("local-thread-") || previousThreadId.startsWith("preview-thread-")
        ? ""
        : previousThreadId;

    setPending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          threadId: persistedThreadId,
          title:
            activeThread?.title && activeThread.title !== "새 스레드"
              ? activeThread.title
              : buildAiThreadTitle(trimmed),
          target,
          body: trimmed,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Chat request failed.");
      }

      const returnedThread =
        data.status === "preview" && previousThreadId
          ? { ...data.thread, id: previousThreadId }
          : data.thread;
      const returnedMessages = Array.isArray(data.messages) ? data.messages : [];

      setMessagesByThread((current) => {
        const next = { ...current };
        const existingMessages =
          previousThreadId && previousThreadId === returnedThread.id
            ? current[previousThreadId] || []
            : [];

        if (previousThreadId && previousThreadId !== returnedThread.id) {
          delete next[previousThreadId];
        }

        next[returnedThread.id] = [...existingMessages, ...returnedMessages];
        return next;
      });

      setThreads((current) => {
        const rest = current.filter(
          (thread) => thread.id !== previousThreadId && thread.id !== returnedThread.id,
        );
        return [returnedThread, ...rest];
      });

      setDrafts((current) => {
        const next = { ...current };
        delete next[previousThreadId];
        next[returnedThread.id] = "";
        return next;
      });

      setActiveThreadId(returnedThread.id);
      setTarget(normalizeAiTarget(returnedThread.target));
      setComposer("");
      setActivityNote(data.message || `${getAiTargetLabel(target)} 대상으로 메시지를 보냈습니다.`);
    } catch (error) {
      setActivityNote(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ai-chat-frame">
      <aside className="ai-chat-rail" aria-label="Chat threads">
        <div className="ai-chat-rail-head">
          <div>
            <p className="section-kicker">Threads</p>
            <h2 className="section-title" style={{ fontSize: "18px" }}>
              열려 있는 대화
            </h2>
          </div>
          <button type="button" className="button button-ghost" onClick={handleNewThread} disabled={pending}>
            {pending ? "전송 중..." : "+ 새 스레드"}
          </button>
        </div>
        <ul className="ai-thread-list">
          {threads.map((thread) => {
            const hasDraft = Boolean(drafts[thread.id]?.trim());

            return (
              <li key={thread.id}>
                <button
                  type="button"
                  className="ai-thread-button"
                  onClick={() => handleSelectThread(thread)}
                >
                  <div
                    className="ai-thread-item"
                    data-active={thread.id === activeThreadId ? "true" : "false"}
                    data-draft={hasDraft ? "true" : "false"}
                  >
                    <div className="ai-thread-head">
                      <strong>{thread.title}</strong>
                      {thread.unread > 0 ? (
                        <span className="legend-chip" data-tone="warning">
                          {thread.unread}
                        </span>
                      ) : hasDraft ? (
                        <span className="legend-chip" data-tone="muted">
                          draft
                        </span>
                      ) : null}
                    </div>
                    <p className="ai-thread-preview">{thread.preview}</p>
                    <div className="ai-thread-meta">
                      <span>{thread.target}</span>
                      <span>{thread.updated}</span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="ai-chat-rail-foot">
          <p className="section-kicker">Agents online</p>
          <ul className="inline-legend" style={{ flexWrap: "wrap" }}>
            {(initialAgents || []).map((agent) => (
              <li
                className="legend-chip"
                data-tone={agent.status === "ready" || agent.status === "live" ? "green" : "blue"}
                key={agent.id}
              >
                {agent.name} · {agent.status}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="ai-chat-pane">
        <header className="ai-chat-pane-head">
          <div>
            <p className="section-kicker">Thread</p>
            <h2 className="section-title" style={{ fontSize: "20px" }}>
              {activeThread?.title || "새 스레드"}
            </h2>
            <p className="muted">
              {(activeThread?.target || getAiTargetLabel(target))} · {activeThread?.updated || "방금"}
            </p>
          </div>
          <div className="ai-chat-target-switch" role="tablist" aria-label="Chat target">
            {AI_TARGETS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === target ? "true" : "false"}
                data-active={item.id === target ? "true" : "false"}
                className="ai-chat-target-btn"
                onClick={() => setTarget(item.id)}
                disabled={pending}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="ai-chat-stream">
          {activeMessages.length ? (
            activeMessages.map((message) => (
              <article className="ai-chat-bubble" data-author={message.author} key={message.id}>
                <header>
                  <span className="legend-chip" data-tone={getAuthorTone(message.author)}>
                    {message.authorLabel}
                  </span>
                  <span className="muted tiny">{message.time}</span>
                </header>
                <p>{message.body}</p>
              </article>
            ))
          ) : (
            <div className="status-note">
              <strong>아직 메시지가 없습니다.</strong>
              <p>지금 컴포저에 한 줄만 입력해도 새 스레드 흐름과 API 응답 목업을 바로 테스트할 수 있습니다.</p>
            </div>
          )}
        </div>

        <form
          className="ai-chat-composer"
          aria-label="Message composer"
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
        >
          <div className="ai-chat-composer-row">
            <label htmlFor="ai-chat-target" className="section-kicker">
              타겟
            </label>
            <select
              id="ai-chat-target"
              name="target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={pending}
            >
              {AI_TARGETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="ai-chat-composer-input"
            rows={3}
            placeholder="여기에 오더나 질문을 입력하세요. / 로 명령, @ 로 에이전트, # 로 레인을 붙일 수 있습니다."
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            disabled={pending}
          />
          <div className="ai-chat-suggest">
            {(initialSuggestions || []).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="legend-chip"
                data-tone="muted"
                onClick={() =>
                  setComposer((current) => (current.trim() ? `${current}\n${suggestion}` : suggestion))
                }
                disabled={pending}
              >
                <code>{suggestion}</code>
              </button>
            ))}
          </div>
          <div className="ai-chat-composer-actions">
            <p className="muted tiny">{activityNote}</p>
            <div className="hero-actions">
              <button type="button" className="button button-secondary" onClick={handleSaveDraft} disabled={pending}>
                초안 저장
              </button>
              <button type="submit" className="button button-primary" disabled={!composer.trim() || pending}>
                {pending ? "보내는 중..." : "보내기"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
