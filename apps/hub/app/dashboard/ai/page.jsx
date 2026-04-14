import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
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

function getWorkloadTone(state) {
  if (state === "overloaded") {
    return "danger";
  }
  if (state === "hot") {
    return "warning";
  }
  if (state === "warm") {
    return "blue";
  }
  return "green";
}

function getVisualToken(token) {
  if (token === "planner") return "Strategy desk";
  if (token === "builder") return "Build rig";
  if (token === "ops") return "Run dock";
  return "Agent lane";
}

export default async function AiConsolePage() {
  const {
    agents,
    chatThreads,
    councilSessions,
    officeLayout,
    openOrders,
    osPulse,
    quickOrderTemplates,
    recentRecalls,
  } = await getAiConsolePageData();

  const liveAgentCount = agents.filter(
    (agent) => agent.status === "ready" || agent.status === "live" || agent.status === "working",
  ).length;
  const readyAgents = agents.filter((agent) => agent.status === "ready" || agent.status === "live");
  const hotAgents = agents.filter((agent) => agent.workloadState === "hot" || agent.workloadState === "overloaded");
  const reusableThreads = chatThreads.filter((thread) => thread.status !== "paused");
  const openOrderCount = openOrders.filter((order) => order.status !== "완료").length;
  const activeCouncilCount = councilSessions.filter((session) => session.status !== "완료").length;
  const unreadThreadCount = chatThreads.reduce((total, thread) => total + (thread.unread || 0), 0);

  return (
    <div className="app-page">
      <section className="operator-header">
        <p className="operator-header__eyebrow">Agent Home</p>
        <h1>에이전트를 다시 부르고, 바로 오더를 내리는 운영 홈</h1>
        <p>누가 바로 투입 가능한지, 누가 바쁜지, 어떤 스레드와 오더가 먼저 열려야 하는지를 첫 화면에서 바로 판단합니다.</p>
      </section>

      <div className="operator-actions" aria-label="AI primary actions">
        <Link className="button button-primary" href="/dashboard/ai/orders">
          새 오더 만들기
        </Link>
        <Link className="button button-secondary" href="/dashboard/ai/chat">
          스레드 이어가기
        </Link>
        <Link className="button button-secondary" href="/dashboard/ai/council">
          카운슬 열기
        </Link>
      </div>

      <section className="signal-strip" aria-label="Agent home summary">
        <article className="signal-strip__item">
          <span>Live agents</span>
          <strong>{`${liveAgentCount} / ${agents.length}`}</strong>
          <p>지금 바로 부를 수 있는 작업 파트너 수.</p>
        </article>
        <article className="signal-strip__item">
          <span>Ready recall</span>
          <strong>{String(readyAgents.length)}</strong>
          <p>바로 재호출 가능한 레인.</p>
        </article>
        <article className="signal-strip__item">
          <span>Hot workload</span>
          <strong>{String(hotAgents.length)}</strong>
          <p>재배정 판단이 먼저 필요한 바쁜 레인.</p>
        </article>
        <article className="signal-strip__item">
          <span>Reusable threads</span>
          <strong>{String(reusableThreads.length)}</strong>
          <p>문맥을 이어붙일 수 있는 활성 스레드.</p>
        </article>
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Quick dispatch"
          title="지금 바로 보내는 액션"
          description="요약보다 먼저, 다시 부르기와 빠른 배정이 첫 화면에 오도록 정리했습니다."
          action={
            <Link className="button button-ghost" href="/dashboard/ai/orders">
              Orders 열기
            </Link>
          }
        >
          <div className="agent-template-list">
            {quickOrderTemplates.map((template) => (
              <article className="agent-template-card" key={template.id}>
                <div>
                  <strong>{template.title}</strong>
                  <p>{template.prompt}</p>
                </div>
                <div className="agent-template-meta">
                  <span className="legend-chip" data-tone="blue">
                    {template.target}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {template.shortcut}
                  </span>
                  <span className="legend-chip" data-tone="warning">
                    {template.defaultPriority}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Recent recall"
          title="방금 다시 불린 에이전트"
          description="최근 재호출 흐름을 먼저 보여줘서, 같은 맥락을 다시 쓰기 쉽게 만듭니다."
        >
          <div className="agent-recall-stack">
            {recentRecalls.slice(0, 3).map((recall) => {
              const agent = agents.find((item) => item.id === recall.agentId);
              return (
                <article className="agent-recall-card" key={recall.id}>
                  <div className="agent-recall-head">
                    <div>
                      <strong>{agent?.name}</strong>
                      <p>{recall.title}</p>
                    </div>
                    <span className="legend-chip" data-tone={getAgentTone(agent?.status)}>
                      {recall.status}
                    </span>
                  </div>
                  <p className="agent-recall-meta">
                    {recall.reason} · {recall.requestedAt}
                  </p>
                </article>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Office"
        title="오피스 플로어"
        description="누가 어느 역할에 붙어 있는지, 텍스트 목록보다 빠르게 훑을 수 있게 배치합니다."
      >
        <div className="agent-office-grid">
          {officeLayout.zones.map((zone) => (
            <article className="agent-office-zone" key={zone.id}>
              <header className="agent-office-zone-head">
                <div>
                  <strong>{zone.label}</strong>
                  <p>{zone.description}</p>
                </div>
                <span className="legend-chip" data-tone={zone.tone}>
                  {zone.occupiedAgentIds.length} occupied
                </span>
              </header>
              <div className="agent-office-seats">
                {zone.occupiedAgentIds.map((agentId) => {
                  const agent = agents.find((item) => item.id === agentId);
                  if (!agent) return null;

                  return (
                    <article className="agent-office-seat" key={agent.id}>
                      <div className="agent-office-seat-top">
                        <span className="agent-office-token">{getVisualToken(agent.visualToken)}</span>
                        <span className="legend-chip" data-tone={getWorkloadTone(agent.workloadState)}>
                          {agent.workloadState}
                        </span>
                      </div>
                      <strong>{agent.name}</strong>
                      <p>{agent.currentTaskTitle}</p>
                    </article>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        kicker="Roster"
        title="다시 부를 에이전트 로스터"
        description="누가 무엇을 잘하고, 지금 어디에 붙어 있는지, 마지막으로 무엇을 마쳤는지 한 번에 읽히게 합니다."
      >
        <div className="ai-agent-grid">
          {agents.map((agent) => (
            <article className="ai-agent-card ai-agent-card-detailed" key={agent.id}>
              <header className="ai-agent-head">
                <div>
                  <p className="ai-agent-name">{agent.name}</p>
                  <p className="ai-agent-role">{agent.role}</p>
                </div>
                <span className="legend-chip" data-tone={getAgentTone(agent.status)}>
                  {agent.status}
                </span>
              </header>
              <div className="agent-card-chip-row">
                <span className="legend-chip" data-tone={getWorkloadTone(agent.workloadState)}>
                  {agent.workloadState}
                </span>
                <span className="legend-chip" data-tone="muted">
                  {agent.workspace}
                </span>
              </div>
              <dl className="ai-agent-stats">
                <div>
                  <dt>Latency</dt>
                  <dd>{agent.latency}</dd>
                </div>
                <div>
                  <dt>Load</dt>
                  <dd>{agent.load}</dd>
                </div>
                <div>
                  <dt>Queue</dt>
                  <dd>{agent.queueDepth}</dd>
                </div>
                <div>
                  <dt>Last active</dt>
                  <dd>{agent.lastActiveAt}</dd>
                </div>
              </dl>
              <p className="ai-agent-focus">{agent.focus}</p>
              <div className="agent-card-block">
                <strong>잘하는 일</strong>
                <div className="agent-card-chip-row">
                  {agent.specialties.map((specialty) => (
                    <span className="legend-chip" data-tone="muted" key={specialty}>
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>
              <div className="agent-card-block">
                <strong>최근 산출물</strong>
                <p>{agent.lastShip}</p>
              </div>
              <div className="hero-actions agent-card-actions">
                <Link className="button button-primary" href="/dashboard/ai/orders">
                  다시 부르기
                </Link>
                <Link className="button button-secondary" href="/dashboard/ai/chat">
                  컨텍스트 보기
                </Link>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        kicker="Open Orders"
        title="실행 중인 오더"
        description="지금 움직이고 있는 오더와 그에 붙은 에이전트. 카드 하나가 하나의 실행 단위입니다."
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
          kicker="Reusable threads"
          title="이어붙이기 좋은 스레드"
          description="지난번 문맥을 살려 다시 돌리기 좋은 스레드부터 위에 둡니다."
          action={
            <Link className="button button-ghost" href="/dashboard/ai/chat">
              스레드로 →
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

        <SectionCard
          kicker="OS Pulse"
          title="에이전트가 보고 있는 운영 스냅샷"
          description="다른 탭을 열지 않아도 지금 OS가 어떤 상태인지 한 번에 잡히도록 묶습니다."
          action={
            <Link className="button button-ghost" href="/dashboard/ai/council">
              카운슬 {activeCouncilCount}건 →
            </Link>
          }
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
          <div className="agent-footer-strip">
            <span className="legend-chip" data-tone="warning">
              unread {unreadThreadCount}
            </span>
            <span className="legend-chip" data-tone="blue">
              open orders {openOrderCount}
            </span>
            <span className="legend-chip" data-tone="green">
              active council {activeCouncilCount}
            </span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
