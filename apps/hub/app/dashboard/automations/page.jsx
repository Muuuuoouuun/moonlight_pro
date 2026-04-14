import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAutomationsPageData } from "@/lib/server-data";

export default async function AutomationsPage() {
  const { automationCards, automationRuns, webhookEndpoints } = await getAutomationsPageData();

  return (
    <>
      <section className="summary-grid" aria-label="자동화 요약 지표">
        <SummaryCard
          title="활성 라우트"
          value={String(webhookEndpoints.length)}
          detail="현재 엔진 화면에서 웹훅 엔드포인트가 노출되고 있습니다."
          badge="인입"
          tone="blue"
        />
        <SummaryCard
          title="최근 런"
          value={String(automationRuns.length)}
          detail="가장 최근 자동화 활동이 빠르게 검토할 수 있을 정도로 보입니다."
          badge="출력"
        />
        <SummaryCard
          title="준비된 커맨드"
          value="열기"
          detail="다음 지시를 보내기 가장 빠른 곳은 여전히 커맨드 센터입니다."
          badge="디스패치"
          tone="warning"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="Surface"
          title="엔진이 노출하는 것"
          description="운영자가 시스템을 다시 해석하지 않아도 훑어볼 수 있도록 화면을 작게 유지합니다."
          action={
            <Link className="button button-secondary" href="/dashboard/automations/runs">
              런 검토
            </Link>
          }
        >
          <div className="project-grid">
            {automationCards.map((item) => (
              <article className="project-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.route}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={item.status === "active" ? "green" : item.status === "ready" ? "blue" : "warning"}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="Runs"
            title="실행 박동"
            description="런 레인은 원시 출력 뒤에 숨지 말고 무슨 일이 있었는지 바로 말해줘야 합니다."
          >
            <div className="timeline">
              {automationRuns.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span
                      className="legend-chip"
                      data-tone={item.status === "success" ? "green" : item.status === "ready" ? "blue" : "warning"}
                    >
                      {item.time}
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Routes"
            title="인입 카탈로그"
            description="명시적인 엔드포인트는 연동을 감사하기 쉽게 만들고 나중에 키우기도 쉽게 합니다."
          >
            <div className="template-grid">
              {webhookEndpoints.map((item) => (
                <div className="template-row" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.note}</p>
                  </div>
                  <span className="endpoint-pill">
                    <span>{item.method}</span>
                    <code>{item.path}</code>
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          kicker="Rules"
          title="운영 가드레일"
          description="몇 가지 단순한 점검만으로도 압박 상황에서 자동화 화면을 예측 가능하게 유지할 수 있습니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>읽을 수 있는 런 요약을 우선합니다</strong>
                <p>각 런은 원시 트레이스로 뛰어들지 않아도 무슨 일이 있었는지 말해줘야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>라우트를 명시적으로 유지합니다</strong>
                <p>모든 연동은 인입 경로를 쉽게 감사할 수 있을 정도로 눈에 보여야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>실패는 빨리 끌어올립니다</strong>
                <p>깨진 자동화는 나머지 셸에 조용히 영향을 주기 전에 여기서 먼저 드러나야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
