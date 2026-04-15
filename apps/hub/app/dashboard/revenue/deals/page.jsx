import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

const DEAL_STAGE_LABEL = {
  prospect: "탐색",
  proposal: "제안",
  negotiation: "협의",
  ready: "준비",
};

function getDealStageLabel(stage) {
  return DEAL_STAGE_LABEL[stage] || stage;
}

export default async function RevenueDealsPage() {
  const [deals, prospectCount, proposalCount, negotiationCount] = await Promise.all([
    fetchRows("deals", { limit: 8, order: "created_at.desc" }),
    countRows("deals", [["stage", "eq.prospect"]]),
    countRows("deals", [["stage", "eq.proposal"]]),
    countRows("deals", [["stage", "eq.negotiation"]]),
  ]);

  const dealRows =
    deals?.map((deal) => ({
      title: deal.title || "기회 건",
      stage: deal.stage || "prospect",
      amount: deal.amount ?? 0,
      detail: deal.expected_close_at
        ? `예상 클로즈 ${formatTimestamp(deal.expected_close_at)}`
        : "예상 클로즈 날짜를 더 선명하게 고정해야 합니다.",
      time: formatTimestamp(deal.created_at),
    })) || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">매출</p>
        <h1>거래와 단계 이동</h1>
        <p>
          거래는 검토하기 쉽고, 책임이 분명하고, 놓치기 어려워야 합니다. 이 화면은 클로즈
          신호를 짧게 압축해 멈춘 기회가 빨리 드러나게 합니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="거래 레인 요약 지표">
        <SummaryCard
          title="탐색"
          value={String(prospectCount ?? dealRows.filter((item) => item.stage === "prospect").length)}
          detail="아직 구체적인 제안으로 다듬는 중인 기회입니다."
          badge="진입"
          tone="warning"
        />
        <SummaryCard
          title="제안"
          value={String(proposalCount ?? dealRows.filter((item) => item.stage === "proposal").length)}
          detail="제안이 나갔고 추진력이 중요한 거래입니다."
          badge="제안안"
          tone="blue"
        />
        <SummaryCard
          title="협의"
          value={String(negotiationCount ?? dealRows.filter((item) => item.stage === "negotiation").length)}
          detail="매일 봐야 할 정도로 클로즈에 가까운 기회입니다."
          badge="클로즈"
          tone="warning"
        />
        <SummaryCard
          title="단계 기준"
          value="명시적"
          detail="각 기회는 다음 단계를 여는 조건을 알고 있어야 합니다."
          badge="프로세스"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="거래"
          title="활성 기회 보드"
          description="거래는 검토하기 쉽고, 책임이 분명하고, 놓치기 어려워야 합니다."
        >
          <div className="timeline">
            {(dealRows.length
              ? dealRows
              : [
                  {
                    title: "거래 레인이 데이터를 기다리는 중입니다",
                    stage: "ready",
                    amount: 0,
                    detail: "거래 데이터가 들어오면 이 보드에 단계, 금액, 예상 클로즈가 보입니다.",
                    time: "대기 중",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.stage === "negotiation" ? "green" : item.stage === "proposal" ? "blue" : "warning"
                    }
                  >
                    {getDealStageLabel(item.stage)}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    ₩{Number(item.amount).toLocaleString("ko-KR")}
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
          title="집중해서 볼 것"
          description="다음 움직임이 같은 수준으로 선명할 때만 이 레인이 유효합니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>다음 단계는 협상의 대상이 아니다</strong>
                <p>회의가 끝나기 전에 후속 일정과 담당자가 정해져 있어야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>멈춘 기회는 빨리 드러난다</strong>
                <p>움직임이 멈춘 항목은 즉시 보이게 만들어야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>클로즈 신호는 짧게 유지한다</strong>
                <p>승부를 여는 조건은 최소한의 문장으로 설명합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
