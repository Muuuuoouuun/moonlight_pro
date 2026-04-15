import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAutomationsPageData } from "@/lib/server-data";

function countRuns(items, predicate) {
  return items.filter(predicate).length;
}

const TONE_LABEL = {
  warning: "주의",
  danger: "위험",
  blue: "정보",
  green: "정상",
  muted: "중립",
};

function getToneLabel(tone) {
  return TONE_LABEL[tone] || tone;
}

export default async function AutomationRunsPage() {
  const { automationRuns, automationTriage } = await getAutomationsPageData();

  return (
    <>
      <section className="summary-grid" aria-label="자동화 실행 요약">
        <SummaryCard
          title="성공"
          value={String(countRuns(automationRuns, (item) => item.status === "success"))}
          detail="최근 정상적으로 끝난 실행 수입니다."
          badge="건강"
        />
        <SummaryCard
          title="대기 / 준비"
          value={String(countRuns(automationRuns, (item) => item.status === "queued" || item.status === "ready"))}
          detail="디스패치나 검토를 기다리는 실행 수입니다."
          badge="대기"
          tone="warning"
        />
        <SummaryCard
          title="주시"
          value={String(countRuns(automationRuns, (item) => item.status === "failure"))}
          detail="재시도나 운영자 점검이 필요한 실행 수입니다."
          badge="주의"
          tone="danger"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="실행"
          title="실행 펄스"
          description="각 실행은 운영자가 스토리를 재구성하지 않아도 무슨 일이 있었는지 설명해야 합니다."
        >
          <div className="timeline">
            {automationRuns.map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}-run`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "success" ? "green" : item.status === "failure" ? "danger" : "warning"
                    }
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
          kicker="규칙"
          title="디스패치 가드레일"
          description="큐가 읽히고 실패 처리가 지루할수록 실행은 더 신뢰할 수 있습니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>복잡함보다 큐를 먼저 본다</strong>
                <p>다음 실행이 분명하지 않다면 이 레인은 이미 너무 많은 일을 하고 있는 것입니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>실패는 깨진 단계를 이름 붙여야 한다</strong>
                <p>운영자는 원시 트레이스를 읽지 않고도 무엇을 재시도할지 알아야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>성공한 실행은 재사용을 가르쳐야 한다</strong>
                <p>자동화가 잘 돌았다면 입력과 출력 패턴도 쉽게 반복 가능해야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        kicker="핸드오프"
        title="실패 분류와 다음 디스패치"
        description="재시도는 명시적이어야 하고, 자동화가 더 이상 정답이 아닌 순간도 같은 수준으로 보여야 합니다."
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
    </>
  );
}
