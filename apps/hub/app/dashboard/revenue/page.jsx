import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getOperationsPageData } from "@/lib/server-data";

function extractCount(detail) {
  const match = detail.match(/\d+/);
  return match ? match[0] : "운영 중";
}

export default async function RevenueOverviewPage() {
  const { operationsBoard } = await getOperationsPageData();

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">매출</p>
        <h1>리드, 거래, 케이스</h1>
        <p>
          매출 레인은 실무 퍼널을 작고 명확하게 유지해, 운영자가 스프레드시트 같은 화면에
          묻히지 않고도 다음 클로즈 행동을 볼 수 있게 합니다.
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
          kicker="보드"
          title="현재 작업 집합"
          description="컴팩트한 매출 보드는 시각적 소음을 늘리지 않고도 퍼널을 읽히게 유지합니다."
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
          kicker="규칙"
          title="운영 원칙"
          description="매출 작업은 다음 움직임이 명확하고 담당이 놓치기 어렵게 보여야 합니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>리드를 먼저 검토한다</strong>
                <p>따뜻한 기회는 큐가 주의를 분산시키기 전에 먼저 다뤄야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>거래에는 다음 단계가 있어야 한다</strong>
                <p>모든 활성 기회에는 담당자와 후속 일정이 분명해야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>케이스가 루프를 닫는다</strong>
                <p>운영 블로커는 빠르게 해소되거나 에스컬레이션 상태로 이동해야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
