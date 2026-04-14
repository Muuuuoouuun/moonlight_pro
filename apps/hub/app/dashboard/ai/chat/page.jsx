import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAiConsolePageData } from "@/lib/server-data";

const CHAT_TARGETS = [
  { id: "both", label: "Claude + Codex" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "engine", label: "Engine" },
];

function getAuthorTone(author) {
  if (author === "claude") return "blue";
  if (author === "codex") return "green";
  if (author === "operator") return "warning";
  return "muted";
}

export default async function AiChatPage() {
  const { agents, chatMessages, chatSuggestions, chatThreads, recentRecalls } =
    await getAiConsolePageData();

  const activeThread = chatThreads[0];
  const unreadThreadCount = chatThreads.filter((thread) => thread.unread > 0).length;
  const reusableThreadCount = chatThreads.filter((thread) => thread.status !== "paused").length;
  const liveAgentCount = agents.filter(
    (agent) => agent.status === "ready" || agent.status === "live" || agent.status === "working",
  ).length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Agent · Threads</p>
        <h1>문맥을 다시 살려서 에이전트와 이어서 일하는 자리</h1>
        <p>
          새로 설명을 반복하는 화면이 아니라, 지난번 대화와 산출물을 다시 붙여 바로 이어가는 화면입니다. 좋은
          스레드는 좋은 에이전트만큼 재사용 가치가 큽니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="Threads summary">
        <SummaryCard
          title="활성 스레드"
          value={String(reusableThreadCount)}
          detail="다시 이어붙일 수 있는 활성 문맥 수."
          badge="Threads"
          tone="blue"
        />
        <SummaryCard
          title="읽지 않은 스레드"
          value={String(unreadThreadCount)}
          detail="새 메시지나 확인이 필요한 대화 수."
          badge="Unread"
          tone="warning"
        />
        <SummaryCard
          title="온라인 에이전트"
          value={String(liveAgentCount)}
          detail="지금 이 스레드를 바로 이어받을 수 있는 가용 에이전트 수."
          badge="Agents"
          tone="green"
        />
        <SummaryCard
          title="최근 재호출"
          value={String(recentRecalls.length)}
          detail="방금 다시 불린 문맥이나 파트너 수."
          badge="Recall"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Recall queue"
          title="지금 이어보기 좋은 문맥"
          description="최근 재호출된 작업부터 먼저 보여줘서, 지난 설명을 다시 쓰지 않게 합니다."
        >
          <ul className="note-list">
            {recentRecalls.map((recall) => (
              <li className="note-row" key={recall.id}>
                <div>
                  <strong>{recall.title}</strong>
                  <p>
                    {recall.reason} · {recall.requestedAt}
                  </p>
                </div>
                <span className="legend-chip" data-tone="blue">
                  {recall.sourceType}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          kicker="Thread actions"
          title="대화에서 바로 넘길 수 있는 액션"
          description="좋은 스레드는 오더와 카운슬로 쉽게 이어져야 합니다."
        >
          <div className="template-grid">
            <div className="template-row">
              <div>
                <strong>이 스레드를 새 오더로 전환</strong>
                <p>선택한 문맥과 목표를 그대로 넘겨 실행 큐에 넣습니다.</p>
              </div>
              <Link className="legend-chip" data-tone="blue" href="/dashboard/ai/orders">
                Orders
              </Link>
            </div>
            <div className="template-row">
              <div>
                <strong>둘이 검토하도록 카운슬 열기</strong>
                <p>설명은 유지하고, 전략과 구현 검토를 동시에 받습니다.</p>
              </div>
              <Link className="legend-chip" data-tone="warning" href="/dashboard/ai/council">
                Council
              </Link>
            </div>
            <div className="template-row">
              <div>
                <strong>에이전트 홈으로 돌아가 배정 다시 보기</strong>
                <p>지금 누가 비어 있는지, 누가 과부하인지 먼저 보고 싶을 때 씁니다.</p>
              </div>
              <Link className="legend-chip" data-tone="green" href="/dashboard/ai">
                Agent Home
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="ai-chat-frame">
        <aside className="ai-chat-rail" aria-label="Chat threads">
          <div className="ai-chat-rail-head">
            <div>
              <p className="section-kicker">Threads</p>
              <h2 className="section-title" style={{ fontSize: "18px" }}>
                열려 있는 문맥
              </h2>
            </div>
            <button type="button" className="button button-ghost" disabled>
              + 새 스레드
            </button>
          </div>
          <ul className="ai-thread-list">
            {chatThreads.map((thread, index) => (
              <li
                className="ai-thread-item"
                data-active={index === 0 ? "true" : "false"}
                key={thread.id}
              >
                <div className="ai-thread-head">
                  <strong>{thread.title}</strong>
                  {thread.unread > 0 ? (
                    <span className="legend-chip" data-tone="warning">
                      {thread.unread}
                    </span>
                  ) : null}
                </div>
                <p className="ai-thread-preview">{thread.preview}</p>
                <div className="ai-thread-meta">
                  <span>{thread.target}</span>
                  <span>{thread.updated}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="ai-chat-rail-foot">
            <p className="section-kicker">Agents online</p>
            <ul className="inline-legend" style={{ flexWrap: "wrap" }}>
              {agents.map((agent) => (
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
              <p className="section-kicker">Active thread</p>
              <h2 className="section-title" style={{ fontSize: "20px" }}>
                {activeThread.title}
              </h2>
              <p className="muted">
                {activeThread.target} · {activeThread.updated}
              </p>
            </div>
            <div className="ai-chat-target-switch" role="tablist" aria-label="Chat target">
              {CHAT_TARGETS.map((target, index) => (
                <button
                  key={target.id}
                  type="button"
                  role="tab"
                  aria-selected={index === 0 ? "true" : "false"}
                  data-active={index === 0 ? "true" : "false"}
                  className="ai-chat-target-btn"
                  disabled
                >
                  {target.label}
                </button>
              ))}
            </div>
          </header>

          <div className="ai-chat-stream">
            {chatMessages.map((message) => (
              <article className="ai-chat-bubble" data-author={message.author} key={message.id}>
                <header>
                  <span className="legend-chip" data-tone={getAuthorTone(message.author)}>
                    {message.authorLabel}
                  </span>
                  <span className="muted tiny">{message.time}</span>
                </header>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <form className="ai-chat-composer" aria-label="Message composer">
            <div className="ai-chat-composer-row">
              <label htmlFor="ai-chat-target" className="section-kicker">
                타겟
              </label>
              <select id="ai-chat-target" name="target" disabled>
                {CHAT_TARGETS.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="ai-chat-composer-input"
              rows={3}
              placeholder="이전 문맥을 살려 질문, 오더, 비교 요청을 입력하세요."
              disabled
            />
            <div className="ai-chat-suggest">
              {chatSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="legend-chip"
                  data-tone="muted"
                  disabled
                >
                  <code>{suggestion}</code>
                </button>
              ))}
            </div>
            <div className="ai-chat-composer-actions">
              <p className="muted tiny">
                연결되면 `/api/ai/chat` 로 POST 되고, 메시지는 오더나 카운슬로 바로 복제할 수 있습니다.
              </p>
              <div className="hero-actions">
                <button type="button" className="button button-secondary" disabled>
                  초안 저장
                </button>
                <button type="button" className="button button-primary" disabled>
                  보내기
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
