import Link from "next/link";
import {
  OperatingPulsePanel,
  OperatingPulseSummaryCards,
} from "@/components/dashboard/operating-pulse";
import { SectionCard } from "@/components/dashboard/section-card";
import { getAutomationsPageData, getOperatingPulseData } from "@/lib/server-data";

const AUTOMATION_STATUS_LABEL = {
  active: "가동 중",
  ready: "준비",
};

const TONE_LABEL = {
  warning: "주의",
  danger: "위험",
  blue: "정보",
  green: "정상",
  muted: "중립",
};

function getAutomationStatusLabel(status) {
  return AUTOMATION_STATUS_LABEL[status] || status;
}

function getToneLabel(tone) {
  return TONE_LABEL[tone] || tone;
}

export default async function AutomationsPage() {
  const [
    { automationCards, automationRuns, automationTriage, webhookEndpoints },
    operatingPulse,
  ] = await Promise.all([getAutomationsPageData(), getOperatingPulseData()]);

  return (
    <>
      <OperatingPulseSummaryCards pulse={operatingPulse} ariaLabel="자동화 운영 펄스 요약" />

      <div className="stack">
        <SectionCard
          kicker="펄스"
          title="운영 관제 보드"
          description="돌고 있는지, 쉬고 있는지, 오늘 얼마나 돌았는지를 자동화·웹훅·에러 루프까지 한 프레임에 모았습니다."
        >
          <OperatingPulsePanel pulse={operatingPulse} />
        </SectionCard>

        <SectionCard
          kicker="표면"
          title="엔진이 노출하는 면"
          description="시스템 전체를 재구성하지 않고도 운영자가 훑을 수 있을 만큼 표면을 작게 유지합니다."
          action={
            <Link className="button button-secondary" href="/dashboard/automations/runs">
              실행 보기
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
                    {getAutomationStatusLabel(item.status)}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="실행"
            title="실행 펄스"
            description="실행 레인은 원시 출력 뒤에 숨지 말고 무슨 일이 있었는지 직접 말해줘야 합니다."
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
            kicker="경로"
            title="인입 카탈로그"
            description="엔드포인트가 명시적일수록 연동은 감사하기 쉽고, 나중에 확장하기도 쉽습니다."
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
          kicker="트리아지"
          title="실패 분류와 사람 핸드오프"
          description="실패, 재시도, 사람 검토가 한자리에 보여야 머신을 계속 신뢰할 수 있습니다."
        >
          <div className="template-grid">
            {automationTriage.map((item) => (
              <div className="template-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <p className="check-detail">
                    <strong>다음</strong> · {item.nextAction}
                  </p>
                  <p className="check-detail">
                    <strong>핸드오프</strong> · {item.handoff}
                  </p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {getToneLabel(item.tone)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="규칙"
          title="운영자 가드레일"
          description="몇 가지 단순한 점검만으로도 압박 속 자동화 표면을 예측 가능하게 유지할 수 있습니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>읽히는 실행 요약을 우선한다</strong>
                <p>각 실행은 원시 트레이스로 뛰지 않아도 무슨 일이 있었는지 말해줘야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>경로를 명시적으로 유지한다</strong>
                <p>모든 연동은 인입 경로를 감사하기 쉬울 만큼 충분히 보여야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>실패를 빠르게 올린다</strong>
                <p>고장난 자동화는 허브의 다른 부분을 조용히 건드리기 전에 여기서 먼저 드러나야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
