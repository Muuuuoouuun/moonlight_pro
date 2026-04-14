import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
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
  const { chatThreads, chatMessages, chatSuggestions, agents } = await getAiConsolePageData();

  const activeThread = chatThreads[0];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Chat</p>
        <h1>Claude와 Codex에게 바로 메시지</h1>
        <p>
          스레드 하나를 골라 에이전트에게 바로 말합니다. 타겟을 Claude, Codex, 둘 다, 혹은 Engine으로 전환하면
          같은 컴포저가 목적지만 바꿉니다.
        </p>
      </section>

      <div className="ai-chat-frame">
        <aside className="ai-chat-rail" aria-label="Chat threads">
          <div className="ai-chat-rail-head">
            <div>
              <p className="section-kicker">Threads</p>
              <h2 className="section-title" style={{ fontSize: "18px" }}>
                열려 있는 대화
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
              <p className="section-kicker">Thread</p>
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
              <article
                className="ai-chat-bubble"
                data-author={message.author}
                key={message.id}
              >
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
              placeholder="여기에 오더나 질문을 입력하세요. / 로 명령, @ 로 에이전트, # 로 레인을 붙일 수 있습니다."
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
                프론트 스캐폴드 단계라 전송은 비활성화 — 연결되면 `/api/ai/chat` 로 POST 됩니다.
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

      <SectionCard
        kicker="Bridge"
        title="대화에서 오더로"
        description="챗이 한 번의 요청을 넘어 실행 단위가 되려면, 메시지가 곧바로 오더나 카운슬로 넘어갈 수 있어야 합니다."
      >
        <div className="template-grid">
          <div className="template-row">
            <div>
              <strong>선택한 메시지를 오더로 전환</strong>
              <p>챗 메시지 하단의 → Orders 버튼을 누르면 해당 요청이 오더 큐에 복제됩니다.</p>
            </div>
            <Link className="legend-chip" data-tone="blue" href="/dashboard/ai/orders">
              Orders
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>Claude ↔ Codex 협의가 필요해지면</strong>
              <p>하나의 스레드가 갈라질 때 바로 카운슬 세션으로 복제 — 쌍방 턴이 남습니다.</p>
            </div>
            <Link className="legend-chip" data-tone="muted" href="/dashboard/ai/council">
              Council
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>OS 상태 확인</strong>
              <p>/status 명령은 자동화·작업·콘텐츠 스냅샷을 이 대화로 끌어옵니다.</p>
            </div>
            <Link className="legend-chip" data-tone="green" href="/dashboard/ai">
              Overview
            </Link>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
