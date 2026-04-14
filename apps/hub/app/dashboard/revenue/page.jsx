import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getOperationsPageData } from "@/lib/server-data";

function extractCount(detail) {
  const match = detail.match(/\d+/);
  return match ? match[0] : "Live";
}

export default async function RevenueOverviewPage() {
  const { operationsBoard } = await getOperationsPageData();

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">매출</p>
        <h1>리드, 딜, 케이스</h1>
        <p>
          매출 레인은 운영자가 스프레드시트 같은 화면에 파묻히지 않으면서도,
          실제 움직이는 퍼널을 작고 분명하게 닫아갈 수 있게 유지합니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="매출 요약 지표">
        {operationsBoard.map((item, index) => (
          <SummaryCard
            key={item.title}
            title={item.title}
            value={extractCount(item.detail)}
            detail={item.detail}
            badge={index === 0 ? "파이프라인" : index === 1 ? "클로즈" : "케이스"}
            tone={index === 0 ? "warning" : index === 1 ? "blue" : "green"}
          />
        ))}
      </section>

      <div className="stack">
        <SectionCard
          kicker="Board"
          title="현재 작업 세트"
          description="작은 매출 보드는 시각적 소음을 늘리지 않고도 퍼널을 읽기 쉽게 유지합니다."
          action={
            <Link className="button button-secondary" href="/dashboard/revenue/leads">
              리드 레인 열기
            </Link>
          }
        >
          <div className="metric-grid">
            {operationsBoard.map((item) => (
              <div className="mini-metric" key={item.title}>
                <span>{item.title}</span>
                <strong>{extractCount(item.detail)}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Rules"
          title="운영 규칙"
          description="매출 작업은 다음 액션이 바로 보이고, 누가 잡아야 하는지 놓치지 않게 해야 합니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>리드는 먼저 검토합니다</strong>
                <p>온기 있는 기회는 큐가 집중력을 분산시키기 전에 먼저 처리해야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>딜에는 다음 단계가 있어야 합니다</strong>
                <p>모든 활성 기회에는 분명한 담당자와 후속 날짜가 붙어 있어야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>케이스가 루프를 닫습니다</strong>
                <p>운영 블로커는 빠르게 해결 또는 에스컬레이션 상태로 움직여야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
