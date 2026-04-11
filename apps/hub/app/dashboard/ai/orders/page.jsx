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
  const { openOrders, orderTemplates } = await getAiConsolePageData();

  const running = openOrders.filter((order) => order.status === "실행 중").length;
  const waitingReview = openOrders.filter((order) => order.status === "리뷰 대기").length;
  const queued = openOrders.filter((order) => order.status === "큐 대기").length;
  const done = openOrders.filter((order) => order.status === "완료").length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Orders</p>
        <h1>에이전트에게 바로 오더</h1>
        <p>
          챗은 대화, 카운슬은 협의, 여기는 실행 단위입니다. 오더는 타겟 에이전트, 우선순위, 레인, 마감을 달고
          큐로 들어가며, 작업 생성과 수정도 같은 폼에서 처리합니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="Orders summary">
        <SummaryCard
          title="실행 중"
          value={String(running)}
          detail="에이전트가 지금 붙잡고 있는 오더."
          badge="Live"
          tone="blue"
        />
        <SummaryCard
          title="리뷰 대기"
          value={String(waitingReview)}
          detail="에이전트가 결과를 내놓고 승인 대기 중인 오더."
          badge="Review"
          tone="warning"
        />
        <SummaryCard
          title="큐 대기"
          value={String(queued)}
          detail="배정되지 않았거나 선행 작업이 안 끝난 오더."
          badge="Queue"
          tone="muted"
        />
        <SummaryCard
          title="오늘 완료"
          value={String(done)}
          detail="에이전트가 오늘 마친 오더 수."
          badge="Done"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="New Order"
          title="오더 때리기"
          description="한 번에 하나의 결과만 나오도록 — 타겟, 제목, 마감, 노트, 이렇게 네 칸이면 충분합니다."
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
                  placeholder="예: AI 콘솔 오더 폼 실제 POST 배선"
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
                  placeholder="무엇을 원하고, 어떤 파일/범위를 건드리며, 완료의 기준이 무엇인지."
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
          kicker="Templates"
          title="반복 오더 템플릿"
          description="자주 쓰는 오더는 템플릿으로 굳혀둡니다. 클릭하면 위 폼에 채워집니다."
        >
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
        description="카드 하나 = 하나의 실행 단위. 상태, 마감, 에이전트, 노트까지 한 장에서 드러냅니다."
        action={
          <Link className="button button-ghost" href="/dashboard/ai">
            Overview로 →
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
