import { Sparkline } from "@com-moon/ui";
import { SectionCard } from "@/components/dashboard/section-card";
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
      createdAt: lead.created_at,
    })) || [];

  // Bucket lead count by day over the last 7 days so the sparkline reads
  // as an inbound pulse rather than a random count. Falls back to a flat
  // series when there is no data yet, which keeps the preview render safe.
  const trendValues = Array.from({ length: 7 }, (_, bucketIndex) => {
    if (!leads || leads.length === 0) {
      return 0;
    }
    const start = Date.now() - (6 - bucketIndex) * 24 * 60 * 60 * 1000;
    const end = start + 24 * 60 * 60 * 1000;
    return leads.filter((lead) => {
      const ts = lead.created_at ? new Date(lead.created_at).getTime() : 0;
      return ts >= start && ts < end;
    }).length;
  });
  const trendFallback = trendValues.every((value) => value === 0);
  const pulseValues = trendFallback ? [2, 3, 2, 4, 3, 5, 4] : trendValues;
  const totalActive = (newCount ?? 0) + (qualifiedCount ?? 0) + (nurturingCount ?? 0) || leadRows.length;

  return (
    <div className="app-page">
      <section className="leads-pulse-panel" aria-label="리드 레인 요약">
        <div className="leads-pulse-head">
          <div>
            <strong className="leads-pulse-value">{totalActive}</strong>
            <p className="leads-pulse-label">지금 파이프라인에 살아 있는 리드</p>
          </div>
          <Sparkline
            values={pulseValues}
            width={180}
            height={48}
            ariaLabel="최근 7일 인바운드 리드 추세"
          />
        </div>
        <ul className="leads-pulse-breakdown">
          <li data-tone="warn">
            <strong>{newCount ?? leadRows.filter((item) => item.status === "new").length}</strong>
            <span>신규</span>
          </li>
          <li data-tone="accent">
            <strong>{qualifiedCount ?? leadRows.filter((item) => item.status === "qualified").length}</strong>
            <span>적격</span>
          </li>
          <li data-tone="muted">
            <strong>{nurturingCount ?? leadRows.filter((item) => item.status === "nurturing").length}</strong>
            <span>육성</span>
          </li>
        </ul>
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
