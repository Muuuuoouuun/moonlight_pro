import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

const CASE_STATUS_LABEL = {
  active: "진행 중",
  waiting: "대기",
  blocked: "막힘",
  ready: "준비",
};

function getCaseStatusLabel(status) {
  return CASE_STATUS_LABEL[status] || status;
}

export default async function RevenueCasesPage() {
  const [cases, activeCount, waitingCount, blockedCount] = await Promise.all([
    fetchRows("operation_cases", { limit: 8, order: "created_at.desc" }),
    countRows("operation_cases", [["status", "eq.active"]]),
    countRows("operation_cases", [["status", "eq.waiting"]]),
    countRows("operation_cases", [["status", "eq.blocked"]]),
  ]);

  const caseRows =
    cases?.map((item) => ({
      title: item.title || "운영 케이스",
      status: item.status || "active",
      detail: item.next_action || "배경 소음으로 사라지기 전에 다음 액션을 먼저 붙여야 합니다.",
      time: formatTimestamp(item.created_at),
    })) || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">매출</p>
        <h1>케이스와 운영 마감</h1>
        <p>
          운영 작업은 이슈 포착에서 담당 액션까지 빠르게 이동해야 합니다. 이 레인은
          블로커가 해소되거나 에스컬레이션될 때까지 계속 보이게 유지합니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="케이스 레인 요약 지표">
        <SummaryCard
          title="진행 중"
          value={String(activeCount ?? caseRows.filter((item) => item.status === "active").length)}
          detail="다음 액션이 보이는 상태로 움직이고 있는 케이스입니다."
          badge="움직임"
          tone="green"
        />
        <SummaryCard
          title="대기"
          value={String(waitingCount ?? caseRows.filter((item) => item.status === "waiting").length)}
          detail="입력, 승인, 외부 의존성 때문에 멈춘 케이스입니다."
          badge="주시"
          tone="blue"
        />
        <SummaryCard
          title="막힘"
          value={String(blockedCount ?? caseRows.filter((item) => item.status === "blocked").length)}
          detail="하루의 우선순위를 바꿀 만큼 분명히 보여야 하는 블로커입니다."
          badge="리스크"
          tone="warning"
        />
        <SummaryCard
          title="담당자"
          value="명확"
          detail="모든 블로커에는 앞으로 움직일 사람 한 명이 붙어 있어야 합니다."
          badge="통제"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="케이스"
          title="케이스 움직임 보드"
          description="운영 작업은 이슈 포착에서 담당 액션까지 빠르게 이어져야 합니다."
        >
          <div className="timeline">
            {(caseRows.length
              ? caseRows
              : [
                  {
                    title: "케이스 레인이 데이터를 기다리는 중입니다",
                    status: "ready",
                    detail: "운영 케이스가 들어오면 이 보드에 블로커, 상태, 다음 액션이 보입니다.",
                    time: "대기 중",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "active" ? "green" : item.status === "waiting" ? "blue" : "warning"
                    }
                  >
                    {getCaseStatusLabel(item.status)}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.time}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="규칙"
          title="반드시 해소할 것"
          description="무엇이 막혔고 무엇이 이미 움직이고 있는지 팀이 볼 수 있을 때 이 레인이 가장 건강합니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>블로커를 즉시 적는다</strong>
                <p>맥락이 사라지기 전에 무엇이 실패했는지 먼저 기록합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>해결 담당을 붙인다</strong>
                <p>다음 운영자는 추정이 아니라 명시적으로 보여야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>루프를 닫는다</strong>
                <p>케이스는 증상 기록이 아니라 결정으로 끝나야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
