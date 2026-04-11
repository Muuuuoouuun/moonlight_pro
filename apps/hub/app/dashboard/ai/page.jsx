import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAiConsolePageData } from "@/lib/server-data";

function getAgentTone(status) {
  if (status === "ready" || status === "live") {
    return "green";
  }
  if (status === "working") {
    return "blue";
  }
  if (status === "stalled" || status === "error") {
    return "danger";
  }
  return "muted";
}

export default async function AiConsolePage() {
  const { agents, openOrders, osPulse, councilSessions, chatThreads } =
    await getAiConsolePageData();

  const liveAgentCount = agents.filter(
    (agent) => agent.status === "ready" || agent.status === "live" || agent.status === "working",
  ).length;

  const openOrderCount = openOrders.filter((order) => order.status !== "완료").length;
  const activeCouncilCount = councilSessions.filter((session) => session.status !== "완료").length;
  const unreadThreadCount = chatThreads.reduce((total, thread) => total + (thread.unread || 0), 0);

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI Console</p>
        <h1>에이전트 하나의 지휘탑</h1>
        <p>
          Claude와 Codex에게 바로 오더를 때리고, 두 모델이 상의하는 자리를 붙이고, 작업 생성과 자동화 상황을 같은
          프레임 안에서 쫓아가기 위한 콘솔입니다.
        </p>
        <p className="page-context">
          <strong>Signal first</strong>
          <span>
            먼저 "지금 뭐 돌아가고 있지?" 한 줄로 답하고, 그 다음에야 챗/카운슬/오더 뷰로 내려갑니다.
          </span>
        </p>
      </section>

      <section className="summary-grid" aria-label="AI console summary">
        <SummaryCard
          title="활성 에이전트"
          value={`${liveAgentCount} / ${agents.length}`}
          detail="가용한 추론 레인 수. 과부하 레인은 오렌지로 표시됩니다."
          badge="Agents"
          tone="green"
        />
        <SummaryCard
          title="오픈 오더"
          value={String(openOrderCount)}
          detail="실행 중이거나 리뷰 대기 중인 오더 — 완료된 오더는 제외."
          badge="Orders"
          tone="blue"
        />
        <SummaryCard
          title="진행 중인 카운슬"
          value={String(activeCouncilCount)}
          detail="Claude와 Codex가 상의·검토하고 있는 주제 수."
          badge="Council"
          tone="warning"
        />
        <SummaryCard
          title="읽지 않은 대화"
          value={String(unreadThreadCount)}
          detail="새 메시지가 쌓인 스레드 수 — 챗 레일에서 바로 확인하세요."
          badge="Chat"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Agents"
          title="에이전트 보드"
          description="누가 뭐에 붙어 있고, 지금 얼마나 여유가 있는지. 오더를 던지기 전에 한 번만 봅니다."
          action={
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/ai/orders">
                오더 때리기
              </Link>
              <Link className="button button-secondary" href="/dashboard/ai/chat">
                챗 열기
              </Link>
            </div>
          }
        >
          <div className="ai-agent-grid">
            {agents.map((agent) => (
              <article className="ai-agent-card" key={agent.id}>
                <header className="ai-agent-head">
                  <div>
                    <p className="ai-agent-name">{agent.name}</p>
                    <p className="ai-agent-role">{agent.role}</p>
                  </div>
                  <span className="legend-chip" data-tone={getAgentTone(agent.status)}>
                    {agent.status}
                  </span>
                </header>
                <dl className="ai-agent-stats">
                  <div>
                    <dt>Latency</dt>
                    <dd>{agent.latency}</dd>
                  </div>
                  <div>
                    <dt>Load</dt>
                    <dd>{agent.load}</dd>
                  </div>
                </dl>
                <p className="ai-agent-focus">{agent.focus}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="OS Pulse"
          title="OS · 자동화 스냅샷"
          description="다른 탭을 열지 않아도 지금 OS가 어떤 상태인지 한 번에 잡히도록 — 작업, 자동화, 콘텐츠, 매출 네 축."
        >
          <ul className="note-list">
            {osPulse.map((pulse) => (
              <li className="note-row" key={pulse.label}>
                <div>
                  <strong>{pulse.label}</strong>
                  <p>{pulse.detail}</p>
                </div>
                <span className="legend-chip" data-tone={pulse.tone}>
                  {pulse.value}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Open Orders"
        title="실행 중인 오더"
        description="지금 움직이고 있는 오더와 그에 붙은 에이전트. 카드 하나 = 한 단위의 작업."
        action={
          <Link className="button button-ghost" href="/dashboard/ai/orders">
            전체 오더로 →
          </Link>
        }
      >
        <div className="project-grid">
          {openOrders.slice(0, 4).map((order) => (
            <article className="project-card" key={order.id}>
              <div className="project-head">
                <div>
                  <h3>{order.title}</h3>
                  <p>
                    {order.lane} · {order.target}
                  </p>
                </div>
                <span className="legend-chip" data-tone={order.tone}>
                  {order.status}
                </span>
              </div>
              <div className="detail-stack">
                <div>
                  <dt>Priority</dt>
                  <dd>{order.priority}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{order.due}</dd>
                </div>
                <div>
                  <dt>Note</dt>
                  <dd>{order.note}</dd>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="Council"
          title="에이전트 상의 중"
          description="Claude와 Codex가 하나의 주제를 놓고 주고받는 턴 로그. 결정까지의 과정을 숨기지 않습니다."
          action={
            <Link className="button button-ghost" href="/dashboard/ai/council">
              카운슬로 →
            </Link>
          }
        >
          <div className="timeline">
            {councilSessions.map((session) => (
              <div className="timeline-item" key={session.id}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={session.tone}>
                    {session.status}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {session.members.join(" · ")}
                  </span>
                </div>
                <strong>{session.topic}</strong>
                <p>{session.turns[session.turns.length - 1]?.body}</p>
                <span className="muted tiny">{session.turns.length}개의 턴</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Chat"
          title="최근 대화"
          description="챗 레일에 쌓여 있는 대화. 읽지 않은 메시지가 있는 스레드부터 눈에 들어오게 합니다."
          action={
            <Link className="button button-ghost" href="/dashboard/ai/chat">
              챗으로 →
            </Link>
          }
        >
          <ul className="note-list">
            {chatThreads.map((thread) => (
              <li className="note-row" key={thread.id}>
                <div>
                  <strong>{thread.title}</strong>
                  <p>
                    {thread.target} · {thread.preview}
                  </p>
                </div>
                <span className="legend-chip" data-tone={thread.unread > 0 ? "warning" : "muted"}>
                  {thread.unread > 0 ? `${thread.unread} new` : thread.updated}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
