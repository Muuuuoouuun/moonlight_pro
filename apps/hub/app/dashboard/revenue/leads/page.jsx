import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

const LEAD_STATUS_LABEL = {
  new: "신규",
  qualified: "적격",
  nurturing: "육성",
  ready: "준비",
};

function getLeadStatusLabel(status) {
  return LEAD_STATUS_LABEL[status] || status;
}

export default async function RevenueLeadsPage() {
  const [leads, newCount, qualifiedCount, nurturingCount] = await Promise.all([
    fetchRows("leads", { limit: 8, order: "created_at.desc" }),
    countRows("leads", [["status", "eq.new"]]),
    countRows("leads", [["status", "eq.qualified"]]),
    countRows("leads", [["status", "eq.nurturing"]]),
  ]);

  const leadRows =
    leads?.map((lead) => ({
      title: lead.source ? `${lead.source} 리드` : "인바운드 리드",
      status: lead.status || "new",
      score: lead.score ?? 0,
      detail: lead.next_action || "리드가 식기 전에 다음 접점을 먼저 고정해야 합니다.",
      time: formatTimestamp(lead.created_at),
    })) || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">매출</p>
        <h1>리드 큐와 적격화</h1>
        <p>
          리드 작업은 작고, 현재성이 있고, 바로 행동할 수 있어야 합니다. 이 레인은 신호가
          아직 따뜻할 때 다음 접점을 분명하게 보이게 하기 위해 존재합니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="리드 레인 요약 지표">
        <SummaryCard
          title="신규"
          value={String(newCount ?? leadRows.filter((item) => item.status === "new").length)}
          detail="아직 적격화와 첫 응답이 필요한 신규 인바운드입니다."
          badge="파이프라인"
          tone="warning"
        />
        <SummaryCard
          title="적격"
          value={String(qualifiedCount ?? leadRows.filter((item) => item.status === "qualified").length)}
          detail="즉시 후속 대응할 만큼 신호가 충분한 리드입니다."
          badge="집중"
          tone="blue"
        />
        <SummaryCard
          title="육성"
          value={String(nurturingCount ?? leadRows.filter((item) => item.status === "nurturing").length)}
          detail="한 번의 접촉보다 시퀀스 관리가 필요한 기회입니다."
          badge="리듬"
          tone="muted"
        />
        <SummaryCard
          title="담당 명확성"
          value="필수"
          detail="모든 리드는 다음 접점을 누가 맡는지 분명해야 합니다."
          badge="운영 기준"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="리드"
          title="리드 큐"
          description="리드 작업은 작고, 최신 상태이며, 바로 행동 가능한 형태를 유지해야 합니다."
        >
          <div className="timeline">
            {(leadRows.length
              ? leadRows
              : [
                  {
                    title: "리드 레인이 데이터를 기다리는 중입니다",
                    status: "ready",
                    score: 0,
                    detail: "리드 레코드가 들어오면 이 보드에 유입원, 상태, 다음 액션이 보입니다.",
                    time: "대기 중",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "qualified" ? "green" : item.status === "nurturing" ? "blue" : "warning"
                    }
                  >
                    {getLeadStatusLabel(item.status)}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    점수 {item.score}
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
          title="반드시 지킬 것"
          description="따뜻한 리드가 먼저 움직이고, 모든 행에 설득력 있는 다음 단계가 있을 때 이 레인이 살아납니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>따뜻한 리드를 먼저 본다</strong>
                <p>큐의 나머지보다 현재 살아 있는 대화를 우선 처리합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>다음 움직임을 문장으로 남긴다</strong>
                <p>모든 리드에는 구체적인 후속 조치나 적격화 액션이 있어야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>퍼널을 정직하게 유지한다</strong>
                <p>멈춘 리드를 결정 경로 없이 진행 중처럼 두지 않습니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
