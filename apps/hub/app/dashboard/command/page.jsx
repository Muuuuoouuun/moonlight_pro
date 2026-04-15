import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getCommandCenterPageData } from "@/lib/server-data";

const QUEUE_TONE_LABEL = {
  green: "즉시 실행",
  warning: "대기",
  blue: "검토",
  danger: "위험",
};

function getQueueToneLabel(tone) {
  return QUEUE_TONE_LABEL[tone] || "검토";
}

export default async function CommandPage() {
  const { quickCommands, commandCenterQueue, automationRuns } = await getCommandCenterPageData();

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">명령</p>
        <h1>지금 바로 디스패치할 오더와 큐</h1>
        <p>
          이 화면은 허브 전체를 다시 훑지 않고도 바로 실행할 수 있는 명령, 대기 중인 후속 작업,
          그리고 최근 자동화 결과를 한곳에 모아 보여줍니다.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/dashboard/ai/orders">
            오더 열기
          </Link>
          <Link className="button button-secondary" href="/dashboard/automations/runs">
            실행 로그 보기
          </Link>
          <Link className="button button-ghost" href="/dashboard/daily-brief">
            브리프 열기
          </Link>
        </div>
      </section>

      <section className="summary-grid" aria-label="명령 센터 요약">
        <SummaryCard
          title="빠른 명령"
          value={String(quickCommands.length)}
          detail="반복적으로 여는 명령을 바로 복사해 실행할 수 있습니다."
          badge="Shortcuts"
          tone="blue"
        />
        <SummaryCard
          title="대기 큐"
          value={String(commandCenterQueue.length)}
          detail="지금 사람이 판단하거나 보내야 하는 후속 작업 수입니다."
          badge="Dispatch"
          tone="warning"
        />
        <SummaryCard
          title="최근 실행"
          value={String(automationRuns.length)}
          detail="최근 자동화 실행을 바로 훑고 다음 조치를 이어갈 수 있습니다."
          badge="Runs"
          tone="green"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="명령"
          title="빠른 실행 팔레트"
          description="입력창을 찾기 전에 자주 쓰는 명령을 바로 복사해 움직일 수 있게 둡니다."
        >
          <div className="template-grid">
            {quickCommands.map((item) => (
              <div className="template-row" key={item.command}>
                <div>
                  <strong>{item.command}</strong>
                  <p>{item.note}</p>
                </div>
                <span className="endpoint-pill">
                  <span>명령</span>
                  <code>{item.command}</code>
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="큐"
            title="지금 디스패치할 후속 작업"
            description="읽기만 하고 끝나는 상태가 아니라, 바로 누구에게 넘길지 보이게 구성합니다."
          >
            <div className="timeline">
              {commandCenterQueue.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.tone}>
                      {getQueueToneLabel(item.tone)}
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="실행"
            title="최근 자동화 결과"
            description="방금 끝난 실행을 보면서 바로 다음 명령이나 사람 검토로 이어지게 합니다."
          >
            <div className="timeline">
              {automationRuns.map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}`}>
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
        </div>
      </div>
    </div>
  );
}
