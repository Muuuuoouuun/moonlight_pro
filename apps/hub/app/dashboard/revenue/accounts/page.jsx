import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

const ACCOUNT_STATUS_LABEL = {
  active: "운영 중",
  paused: "일시 중지",
  closed: "종결",
};

function getAccountStatusLabel(status) {
  return ACCOUNT_STATUS_LABEL[status] || status;
}

function formatAccountRow(row) {
  return {
    title: row.name || "고객 계정",
    status: row.status || "active",
    detail: `마지막 업데이트 ${formatTimestamp(row.created_at)}`,
  };
}

const fallbackAccounts = [
  {
    title: "핵심 고객 레인",
    status: "active",
    detail: "가장 신뢰가 큰 계정을 충분히 보이게 두어 딜리버리 품질을 지킵니다.",
  },
  {
    title: "일시 중지 계정 모니터",
    status: "paused",
    detail: "일시 중지 계정은 재가동 또는 종료 판단이 분명해야 합니다.",
  },
  {
    title: "종결 계정 아카이브",
    status: "closed",
    detail: "종료된 계정도 이후 케이스와 증거 재사용을 위한 맥락을 남겨야 합니다.",
  },
];

export default async function RevenueAccountsPage() {
  const [accounts, activeCount, pausedCount, closedCount] = await Promise.all([
    fetchRows("customer_accounts", { limit: 8, order: "created_at.desc" }),
    countRows("customer_accounts", [["status", "eq.active"]]),
    countRows("customer_accounts", [["status", "eq.paused"]]),
    countRows("customer_accounts", [["status", "eq.closed"]]),
  ]);

  const accountRows = accounts?.length ? accounts.map(formatAccountRow) : fallbackAccounts;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">매출</p>
        <h1>계정과 고객 상태</h1>
        <p>
          계정 레인은 클로즈 이후 관계를 계속 보이게 유지합니다. 진행 중인 고객 작업이
          담당, 상태, 다음 기회에서 멀어지지 않게 하기 위한 화면입니다.
        </p>
      </section>

      <section className="summary-grid" aria-label="계정 레인 요약 지표">
        <SummaryCard
          title="운영 중"
          value={String(activeCount ?? accountRows.filter((item) => item.status === "active").length)}
          detail="현재 서비스 중이거나 후속 운영이 진행 중인 계정입니다."
          badge="건강도"
        />
        <SummaryCard
          title="일시 중지"
          value={String(pausedCount ?? accountRows.filter((item) => item.status === "paused").length)}
          detail="재가동 또는 종료 판단이 필요한 계정입니다."
          badge="주시"
          tone="warning"
        />
        <SummaryCard
          title="종결"
          value={String(closedCount ?? accountRows.filter((item) => item.status === "closed").length)}
          detail="관계는 끝났지만 여전히 유용한 맥락을 가진 계정입니다."
          badge="보관"
          tone="muted"
        />
        <SummaryCard
          title="담당자"
          value="가시화"
          detail="각 계정은 다음 움직임을 누가 가져가는지 분명히 보여야 합니다."
          badge="명확성"
          tone="blue"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="계정"
          title="고객 상태 보드"
          description="하루가 시끄러워지기 전에 빠르게 훑을 수 있을 만큼 계정 레인을 컴팩트하게 유지합니다."
        >
          <div className="timeline">
            {accountRows.map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={item.status === "active" ? "green" : item.status === "paused" ? "warning" : "muted"}
                  >
                    {getAccountStatusLabel(item.status)}
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
          title="계정을 읽기 쉽게 유지하는 법"
          description="서비스 상태와 다음 액션이 선명할 때 고객 레인이 가장 건강합니다."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>운영 중 관계를 먼저 보호한다</strong>
                <p>일시 중지나 보관 상태보다 운영 중 계정이 먼저 보여야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>중지는 의도를 남긴다</strong>
                <p>일시 중지 계정에는 사유와 재진입 조건이 함께 있어야 합니다.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>보관 맥락을 깨끗하게 남긴다</strong>
                <p>종결 계정도 증거, 이슈, 관계 기억을 충분히 보존해야 합니다.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
