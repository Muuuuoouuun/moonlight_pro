import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAiConsolePageData } from "@/lib/server-data";

const TARGETS = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "both", label: "Claude + Codex" },
  { id: "engine", label: "Engine" },
];

const PRIORITIES = [
  { id: "P0", label: "P0 · 긴급" },
  { id: "P1", label: "P1 · 오늘" },
  { id: "P2", label: "P2 · 이번 주" },
  { id: "P3", label: "P3 · 백로그" },
];

const LANES = ["Hub UX", "Engine", "Content", "Automations", "Revenue", "Work OS"];

export default async function AiOrdersPage() {
  const { agents, openOrders, orderTemplates, quickOrderTemplates, recentRecalls } =
    await getAiConsolePageData();

  const running = openOrders.filter((order) => order.status === "실행 중").length;
  const waitingReview = openOrders.filter((order) => order.status === "리뷰 대기").length;
  const queued = openOrders.filter((order) => order.status === "큐 대기").length;
  const done = openOrders.filter((order) => order.status === "완료").length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Agent · Orders</p>
        <h1>누구에게 무엇을 시킬지 빠르게 정하고 바로 큐에 넣는 자리</h1>
        <p>
          좋은 Orders 화면은 긴 설명보다 빠른 배정이 먼저입니다. 작업 종류를 고르고, 적합한 에이전트를 보고,
          컨텍스트를 붙여 보내는 흐름이 가장 중요합니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="Orders summary">
        <SummaryCard
          title="실행 중"
          value={String(running)}
          detail="에이전트가 지금 붙잡고 있는 오더 수."
          badge="Live"
          tone="blue"
        />
        <SummaryCard
          title="리뷰 대기"
          value={String(waitingReview)}
          detail="결과는 나왔고 승인이나 확인이 필요한 오더 수."
          badge="Review"
          tone="warning"
        />
        <SummaryCard
          title="큐 대기"
          value={String(queued)}
          detail="배정되거나 선행 작업이 끝나기를 기다리는 오더 수."
          badge="Queue"
          tone="muted"
        />
        <SummaryCard
          title="오늘 완료"
          value={String(done)}
          detail="오늘 처리 완료된 오더 수."
          badge="Done"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Quick start"
          title="자주 쓰는 빠른 오더"
          description="빈 폼보다 빠른 선택지가 먼저 보이도록, 자주 쓰는 작업 유형을 위에 둡니다."
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
                  <span className="legend-chip" data-tone="warning">
                    {template.defaultPriority}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {template.shortcut}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Dispatch hints"
          title="지금 누구에게 보내기 좋은가"
          description="상태, 강점, 최근 작업을 같이 보여줘서 오더 배정을 빠르게 만듭니다."
        >
          <ul className="note-list">
            {agents.map((agent) => (
              <li className="note-row" key={agent.id}>
                <div>
                  <strong>{agent.name}</strong>
                  <p>
                    {agent.specialties.slice(0, 2).join(" · ")} · 최근 {agent.lastShip}
                  </p>
                </div>
                <span className="legend-chip" data-tone={agent.workloadState === "hot" ? "warning" : "green"}>
                  {agent.workloadState}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="New Order"
          title="오더 만들기"
          description="한 번에 하나의 결과만 나오도록, 타겟, 제목, 마감, 지시사항만 먼저 받습니다."
        >
          <form className="ai-order-form" aria-label="Dispatch a new order">
            <div className="ai-order-form-grid">
              <div className="ai-order-field">
                <label htmlFor="order-title" className="section-kicker">
                  제목
                </label>
                <input
                  id="order-title"
                  name="title"
                  type="text"
                  placeholder="예: Agent 탭 Orders 화면 실제 POST 배선"
                  disabled
                />
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-target" className="section-kicker">
                  타겟
                </label>
                <select id="order-target" name="target" disabled>
                  {TARGETS.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-priority" className="section-kicker">
                  우선순위
                </label>
                <select id="order-priority" name="priority" disabled>
                  {PRIORITIES.map((priority) => (
                    <option key={priority.id} value={priority.id}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-lane" className="section-kicker">
                  레인
                </label>
                <select id="order-lane" name="lane" disabled>
                  {LANES.map((lane) => (
                    <option key={lane} value={lane}>
                      {lane}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ai-order-field">
                <label htmlFor="order-due" className="section-kicker">
                  마감
                </label>
                <input id="order-due" name="due" type="text" placeholder="예: 오늘 17:00" disabled />
              </div>

              <div className="ai-order-field ai-order-field-full">
                <label htmlFor="order-note" className="section-kicker">
                  지시사항
                </label>
                <textarea
                  id="order-note"
                  name="note"
                  rows={4}
                  placeholder="원하는 결과, 건드릴 범위, 완료 기준을 짧게 적습니다."
                  disabled
                />
              </div>
            </div>

            <div className="ai-chat-composer-actions">
              <p className="muted tiny">
                배선되면 `/api/ai/orders` 로 POST 되고, 결과는 아래 오픈 오더 리스트에 즉시 반영됩니다.
              </p>
              <div className="hero-actions">
                <button type="button" className="button button-secondary" disabled>
                  초안 저장
                </button>
                <button type="button" className="button button-primary" disabled>
                  오더 발송
                </button>
              </div>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          kicker="Context"
          title="바로 붙일 수 있는 이전 문맥"
          description="최근 재호출된 작업은 새 오더에 컨텍스트로 바로 붙여 보내기 좋습니다."
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
                <span className="legend-chip" data-tone="muted">
                  {recall.status}
                </span>
              </li>
            ))}
          </ul>
          <ul className="note-list">
            {orderTemplates.map((template) => (
              <li className="note-row" key={template.id}>
                <div>
                  <strong>{template.title}</strong>
                  <p>
                    <code>{template.prompt}</code>
                  </p>
                </div>
                <span className="legend-chip" data-tone="blue">
                  {template.target}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Open Orders"
        title="오픈 오더"
        description="카드 하나가 하나의 실행 단위입니다. 상태, 마감, 에이전트, 메모를 같은 장에서 읽습니다."
        action={
          <Link className="button button-ghost" href="/dashboard/ai">
            Agent Home으로 →
          </Link>
        }
      >
        <div className="project-grid">
          {openOrders.map((order) => (
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
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <button type="button" className="button button-ghost" disabled>
                  수정
                </button>
                <button type="button" className="button button-secondary" disabled>
                  재배정
                </button>
                <button type="button" className="button button-primary" disabled>
                  로그 보기
                </button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
