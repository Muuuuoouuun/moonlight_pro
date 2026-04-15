"use client";

import Link from "next/link";
import { useState } from "react";

import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";

function matchesAgentTarget(target, agentName) {
  if (agentName === "Engine") {
    return target === "Engine";
  }

  if (target === "Claude + Codex") {
    return agentName === "Claude" || agentName === "Codex";
  }

  return target === agentName;
}

function getAgentTone(status) {
  if (status === "ready" || status === "live") return "green";
  if (status === "working") return "blue";
  if (status === "stalled" || status === "error") return "danger";
  return "muted";
}

function buildChatHref({ target, draft, title = "", source = "Situation Deck" }) {
  const params = new URLSearchParams({
    target,
    draft,
    source,
  });

  if (title) {
    params.set("title", title);
  }

  return `/dashboard/ai/chat?${params.toString()}`;
}

function buildCouncilHref({ topic, context, members, source = "Situation Deck" }) {
  const params = new URLSearchParams({
    topic,
    context,
    members,
    source,
  });

  return `/dashboard/ai/council?${params.toString()}`;
}

function buildOrderHref({
  title,
  note,
  target,
  priority = "P1",
  lane = "Hub UX",
  due = "오늘",
  source = "Situation Deck",
}) {
  const params = new URLSearchParams({
    title,
    note,
    target,
    priority,
    lane,
    due,
    source,
  });

  return `/dashboard/ai/orders?${params.toString()}`;
}

const TARGET_ROTATION = [
  { id: "both", label: "Claude + Codex" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "engine", label: "Engine" },
];

function normalizeTargetLabelToId(label) {
  if (label === "Claude + Codex") return "both";
  if (label === "Claude") return "claude";
  if (label === "Codex") return "codex";
  if (label === "Engine") return "engine";
  return "both";
}

function buildOrderRail(orders) {
  return [
    {
      id: "queued",
      label: "큐 대기",
      description: "아직 배정되지 않았거나 선행 흐름을 기다리는 오더",
      tone: "muted",
      items: orders.filter((item) => item.status === "큐 대기"),
    },
    {
      id: "running",
      label: "실행 중",
      description: "에이전트가 지금 붙어 있는 라이브 오더",
      tone: "blue",
      items: orders.filter((item) => item.status === "실행 중"),
    },
    {
      id: "review",
      label: "리뷰 대기",
      description: "결과가 나왔고 사람 승인이나 확인을 기다리는 오더",
      tone: "warning",
      items: orders.filter((item) => item.status === "리뷰 대기"),
    },
    {
      id: "done",
      label: "오늘 완료",
      description: "최근 완료된 오더와 닫힌 흐름",
      tone: "green",
      items: orders.filter((item) => item.status === "완료"),
    },
  ];
}

export function AiOfficeScene({
  commandStrip,
  agents,
  orderRail,
  activityTicker,
  memoryLane,
  chatThreads,
  councilSessions,
  operatingPulse,
}) {
  const [officeOrderRail, setOfficeOrderRail] = useState(orderRail);
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || null);
  const [reassigningOrderId, setReassigningOrderId] = useState(null);
  const [officeNote, setOfficeNote] = useState(
    "상황실에서 오더는 읽기 중심이지만, 재배정은 바로 테스트할 수 있습니다.",
  );

  const activeAgent = agents.find((item) => item.id === selectedAgentId) || agents[0] || null;
  const flattenedOrders = officeOrderRail.flatMap((lane) => lane.items || []);
  const relatedOrders = activeAgent
    ? flattenedOrders.filter((item) => matchesAgentTarget(item.target, activeAgent.name))
    : [];
  const relatedThreads = activeAgent
    ? chatThreads.filter((item) => matchesAgentTarget(item.target, activeAgent.name))
    : [];
  const relatedSessions = activeAgent
    ? councilSessions.filter((item) => item.members.includes(activeAgent.name))
    : [];
  const relatedActivity = activeAgent
    ? activityTicker.filter((item) => {
        if (activeAgent.name === "Engine") {
          return item.href === "/dashboard/automations/runs";
        }

        return item.title.includes(activeAgent.name);
      })
    : [];
  const activeAgentChatHref = activeAgent
    ? buildChatHref({
        target: activeAgent.name === "Engine" ? "engine" : activeAgent.name.toLowerCase(),
        title: `${activeAgent.name} focus handoff`,
        draft: `${activeAgent.name} 레인 상황 공유:\n- 현재 focus: ${activeAgent.focus}\n- 최근 액션: ${activeAgent.recentAction}\n- 다음 한 단계 제안 부탁`,
      })
    : "/dashboard/ai/chat";
  const activeAgentCouncilHref = activeAgent
    ? buildCouncilHref({
        topic: `${activeAgent.name} focus 검토`,
        context: `${activeAgent.name}의 현재 focus는 "${activeAgent.focus}" 입니다. 관련 오더와 최근 활동을 보고 다음 액션을 정리합니다.`,
        members: activeAgent.name === "Engine" ? "engine,codex" : "claude,codex",
      })
    : "/dashboard/ai/council";
  const activeAgentOrderHref = activeAgent
    ? buildOrderHref({
        title: `${activeAgent.name} follow-up`,
        note: `${activeAgent.name}의 현재 focus "${activeAgent.focus}" 기준 후속 작업을 정의합니다.`,
        target: activeAgent.name === "Engine" ? "engine" : activeAgent.name.toLowerCase(),
        lane: activeAgent.name === "Engine" ? "Automations" : "Hub UX",
      })
    : "/dashboard/ai/orders";

  async function handleReassign(order) {
    const currentTargetId = normalizeTargetLabelToId(order.target);
    const currentIndex = TARGET_ROTATION.findIndex((item) => item.id === currentTargetId);
    const nextTarget = TARGET_ROTATION[currentIndex === -1 ? 0 : (currentIndex + 1) % TARGET_ROTATION.length];

    setReassigningOrderId(order.id);

    try {
      const response = await fetch("/api/ai/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "reassign",
          id: order.id,
          title: order.title,
          target: nextTarget.id,
          priority: order.priority,
          lane: order.lane,
          due: order.due,
          note: order.note,
          status: order.status === "큐 대기" ? "running" : order.status,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.error || "Order reassign failed.");
      }

      const updatedOrders = flattenedOrders.map((item) => (item.id === order.id ? data.order : item));
      setOfficeOrderRail(buildOrderRail(updatedOrders));
      setOfficeNote(
        data.message || `"${order.title}" 오더를 ${nextTarget.label} 대상으로 재배정했습니다.`,
      );
    } catch (error) {
      setOfficeNote(error instanceof Error ? error.message : String(error));
    } finally {
      setReassigningOrderId(null);
    }
  }

  return (
    <>
      <section className="summary-grid" aria-label="AI office command strip">
        {commandStrip.map((item) => (
          <SummaryCard key={item.title} {...item} />
        ))}
      </section>

      <div className="ai-office">
        <div className="ai-office__main">
          <SectionCard
            kicker="Situation Deck"
            title="에이전트가 움직이는 운영 장면"
            description="챗, 카운슬, 오더, 머신 펄스를 하나의 장면 안에서 읽습니다. 셀을 누르면 우측 포커스 렌즈가 바뀝니다."
          >
            <div className="ai-office__hero">
              <div className="ai-office__hero-copy">
                <p className="section-kicker">Signal first</p>
                <h3>지금 누가 어떤 흐름에 붙어 있는지 먼저 읽는 표면</h3>
                <p>
                  픽셀 오피스 대신, 문스톤 상황실 톤으로 에이전트 셀과 오더 레일을 정리했습니다. 숫자보다 관계를 먼저
                  보여주는 읽기 전용 운영 뷰입니다.
                </p>
              </div>
              <div className="ai-office__hero-metrics">
                <div className="ai-office__hero-metric">
                  <strong>{operatingPulse.metrics.runningCount}</strong>
                  <span>live runs</span>
                </div>
                <div className="ai-office__hero-metric">
                  <strong>{operatingPulse.metrics.queuedCount}</strong>
                  <span>queued</span>
                </div>
                <div className="ai-office__hero-metric">
                  <strong>{operatingPulse.metrics.attentionCount}</strong>
                  <span>attention</span>
                </div>
              </div>
            </div>

            <div className="ai-office__agent-grid">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className="ai-office__agent-cell"
                  data-active={agent.id === activeAgent?.id ? "true" : "false"}
                  onClick={() => setSelectedAgentId(agent.id)}
                >
                  <div className="ai-office__agent-head">
                    <div>
                      <p className="ai-office__agent-name">{agent.name}</p>
                      <p className="ai-office__agent-role">{agent.role}</p>
                    </div>
                    <span className="legend-chip" data-tone={getAgentTone(agent.status)}>
                      {agent.status}
                    </span>
                  </div>

                  <dl className="ai-office__agent-meta">
                    <div>
                      <dt>Focus</dt>
                      <dd>{agent.focus}</dd>
                    </div>
                    <div>
                      <dt>Order</dt>
                      <dd>{agent.activeOrder?.title || "직접 배정된 오더 없음"}</dd>
                    </div>
                  </dl>

                  <div className="ai-office__agent-stats">
                    <span>{agent.assignedCount} orders</span>
                    <span>{agent.threadCount} threads</span>
                    <span>{agent.councilCount} councils</span>
                  </div>

                  <p className="ai-office__agent-foot">최근 액션 · {agent.recentAction}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Order Rail"
            title="상태별 오더 흐름"
            description="상황실에서는 drag 대신 현재 흐름을 읽는 데 집중합니다. 세부 변경은 Orders surface에서 이어집니다."
            action={
              <Link className="button button-secondary" href="/dashboard/ai/orders">
                Orders 열기
              </Link>
            }
          >
            <div className="ai-office__rail">
              {officeOrderRail.map((lane) => (
                <section className="ai-office__lane" key={lane.id}>
                  <header className="ai-office__lane-head">
                    <div>
                      <strong>{lane.label}</strong>
                      <p>{lane.description}</p>
                    </div>
                    <span className="legend-chip" data-tone={lane.tone}>
                      {lane.items.length}
                    </span>
                  </header>

                  <div className="ai-office__lane-body">
                    {lane.items.length ? (
                      lane.items.map((item) => (
                        <article className="ai-office__order-token" key={item.id}>
                          <div className="ai-office__order-token-head">
                            <strong>{item.title}</strong>
                            <span className="legend-chip" data-tone={item.tone}>
                              {item.priority}
                            </span>
                          </div>
                          <p>{item.note}</p>
                          <div className="ai-office__order-token-meta">
                            <span>{item.target}</span>
                            <span>{item.lane}</span>
                            <span>{item.due}</span>
                          </div>
                          <div className="ai-office__order-token-actions">
                            <Link
                              href={buildChatHref({
                                target:
                                  item.target === "Engine"
                                    ? "engine"
                                    : item.target.includes("Claude + Codex")
                                      ? "both"
                                      : item.target.toLowerCase(),
                                title: item.title,
                                draft: `${item.title}\n\n현재 상태: ${item.status}\n우선순위: ${item.priority}\n레인: ${item.lane}\n메모: ${item.note}`,
                              })}
                            >
                              챗
                            </Link>
                            <Link
                              href={buildCouncilHref({
                                topic: `${item.title} 검토`,
                                context: `${item.title} 오더를 검토합니다. 현재 상태는 ${item.status}, 우선순위는 ${item.priority}, 레인은 ${item.lane} 입니다. 메모: ${item.note}`,
                                members: item.target === "Engine" ? "engine,codex" : "claude,codex",
                              })}
                            >
                              카운슬
                            </Link>
                            <Link
                              href={buildOrderHref({
                                title: item.title,
                                note: item.note,
                                target:
                                  item.target === "Engine"
                                    ? "engine"
                                    : item.target.includes("Claude + Codex")
                                      ? "both"
                                      : item.target.toLowerCase(),
                                priority: item.priority,
                                lane: item.lane,
                                due: item.due,
                              })}
                            >
                              오더 수정
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleReassign(item)}
                              disabled={reassigningOrderId === item.id}
                            >
                              {reassigningOrderId === item.id ? "재배정 중..." : "재배정"}
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="ai-office__lane-empty">
                        <strong>{lane.label} 오더 없음</strong>
                        <p>이 레인은 지금 조용합니다.</p>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="ai-office__side">
          <SectionCard
            kicker="Focus Lens"
            title={activeAgent ? `${activeAgent.name} focus` : "선택된 에이전트 없음"}
            description="선택한 셀 주변의 관련 오더, 스레드, 카운슬, 활동을 한 번에 읽습니다."
          >
            {activeAgent ? (
              <div className="ai-office__focus">
                <div className="ai-office__focus-head">
                  <div>
                    <p className="section-kicker">Current role</p>
                    <h3>{activeAgent.role}</h3>
                  </div>
                  <span className="legend-chip" data-tone={getAgentTone(activeAgent.status)}>
                    {activeAgent.status}
                  </span>
                </div>

                <div className="detail-stack">
                  <div>
                    <dt>Focus</dt>
                    <dd>{activeAgent.focus}</dd>
                  </div>
                  <div>
                    <dt>Active order</dt>
                    <dd>{activeAgent.activeOrder?.title || "직접 할당된 오더가 없습니다."}</dd>
                  </div>
                  <div>
                    <dt>Latency / Load</dt>
                    <dd>
                      {activeAgent.latency} · {activeAgent.load}
                    </dd>
                  </div>
                </div>

                <div className="template-grid">
                  <div className="template-row">
                    <div>
                      <strong>관련 오더</strong>
                      <p>
                        {relatedOrders.length
                          ? relatedOrders.map((item) => item.title).join(" · ")
                          : "현재 이 에이전트에 연결된 오더가 없습니다."}
                      </p>
                    </div>
                    <span className="legend-chip" data-tone="blue">
                      {relatedOrders.length}
                    </span>
                  </div>
                  <div className="template-row">
                    <div>
                      <strong>관련 스레드</strong>
                      <p>
                        {relatedThreads.length
                          ? relatedThreads[0].title
                          : "연결된 챗 스레드가 아직 없습니다."}
                      </p>
                    </div>
                    <span className="legend-chip" data-tone="muted">
                      {relatedThreads.length}
                    </span>
                  </div>
                  <div className="template-row">
                    <div>
                      <strong>관련 카운슬</strong>
                      <p>
                        {relatedSessions.length
                          ? relatedSessions[0].topic
                          : "현재 연결된 카운슬 세션이 없습니다."}
                      </p>
                    </div>
                    <span className="legend-chip" data-tone="warning">
                      {relatedSessions.length}
                    </span>
                  </div>
                </div>

                <div className="hero-actions">
                  <Link className="button button-secondary" href={activeAgentChatHref}>
                    챗 초안 열기
                  </Link>
                  <Link className="button button-ghost" href={activeAgentCouncilHref}>
                    카운슬 초안 열기
                  </Link>
                  <Link className="button button-ghost" href={activeAgentOrderHref}>
                    오더 초안 만들기
                  </Link>
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            kicker="Activity Ticker"
            title="지금 막 지나간 움직임"
            description="상상 로그가 아니라 실제 데이터 소스에서 온 최근 변화만 붙입니다."
          >
            <div className="timeline">
              {activityTicker.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.tone}>
                      {item.time}
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <div className="ai-office__activity-link">
                    <Link href={item.href}>원본 surface 열기</Link>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted tiny" style={{ marginTop: "12px" }}>
              {officeNote}
            </p>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        kicker="Memory Lane"
        title="최근 기억과 학습 흔적"
        description="상황실은 지금의 움직임만 보지 않고, Evolution과 Decisions에서 남긴 흔적을 함께 붙여 읽습니다."
      >
        <div className="template-grid">
          {memoryLane.length ? (
            memoryLane.map((item) => (
              <div className="template-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <div className="ai-office__memory-meta">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.meta}
                  </span>
                  <Link href={item.href}>열기</Link>
                </div>
              </div>
            ))
          ) : (
            <div className="template-row">
              <div>
                <strong>기억 레인이 아직 비어 있습니다</strong>
                <p>메모, 결정, 미해결 로그가 쌓이면 이 보드에 함께 노출됩니다.</p>
              </div>
              <span className="legend-chip" data-tone="muted">
                pending
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {relatedActivity.length ? (
        <SectionCard
          kicker="Focused Activity"
          title={`${activeAgent?.name || "선택된 에이전트"} 주변 이벤트`}
          description="포커스 렌즈에서 현재 선택한 에이전트와 직접 맞닿는 이벤트만 한 번 더 좁혀 보여줍니다."
        >
          <div className="timeline">
            {relatedActivity.slice(0, 4).map((item) => (
              <div className="timeline-item" key={`${item.id}-focused`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.time}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}
