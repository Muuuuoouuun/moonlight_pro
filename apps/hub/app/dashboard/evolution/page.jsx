import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp, getLogsPageData } from "@/lib/server-data";

const evolutionRules = [
  {
    title: "증상과 원인을 함께 기록합니다",
    detail: "로그 한 줄은 무슨 일이 있었고 무엇이 유력한 원인인지까지 말해야 합니다.",
  },
  {
    title: "후속 담당자를 한 명 붙입니다",
    detail: "다음 액션을 실제로 할 사람이 있어야 개선 루프가 작동합니다.",
  },
  {
    title: "반복 이슈와 단발 이슈를 구분합니다",
    detail: "반복 패턴은 한 번의 나쁜 런과 다른 방식으로 다뤄야 합니다.",
  },
  {
    title: "결정으로 마무리합니다",
    detail: "좋은 학습 루프는 고통 요약이 아니라 구체적인 선택으로 끝나야 합니다.",
  },
];

export default async function EvolutionPage() {
  const [logData, issues, memos, activityLogs, openLogs, openIssues] = await Promise.all([
    getLogsPageData(),
    fetchRows("issues", { limit: 4, order: "created_at.desc" }),
    fetchRows("memos", { limit: 4, order: "created_at.desc" }),
    fetchRows("activity_logs", { limit: 4, order: "created_at.desc" }),
    countRows("error_logs", [["resolved", "eq.false"]]),
    countRows("issues", [["status", "eq.open"]]),
  ]);

  const evolutionMetrics = [
    {
      title: "포착된 신호",
      value: String((logData.logItems?.length ?? 0) + (activityLogs?.length ?? 0)),
      detail: "로그와 최근 활동이 같은 학습 루프 안에 놓여 있습니다.",
      badge: "학습",
      tone: "green",
    },
    {
      title: "열린 수정 건",
      value: String((openLogs ?? 0) + (openIssues ?? 0)),
      detail: "보이는 이슈와 미해결 로그에는 아직 담당이 필요합니다.",
      badge: "주의",
      tone: "warning",
    },
    {
      title: "메모",
      value: String(memos?.length ?? 0),
      detail: "다음 패스를 위한 짧은 기억 메모가 쌓였습니다.",
      badge: "기억",
      tone: "blue",
    },
    {
      title: "최근 활동",
      value: String(activityLogs?.length ?? 0),
      detail: "맥락이 흐려지기 전에 시스템 간 움직임이 보입니다.",
      badge: "흔적",
      tone: "muted",
    },
  ];

  const evolutionSignals = [
    {
      title: "에러 로그",
      status: "warning",
      detail: `${openLogs ?? 0}개의 미해결 로그에 아직 후속 담당자가 필요합니다.`,
    },
    {
      title: "이슈 보드",
      status: "blue",
      detail: `${issues?.length ?? 0}개의 최근 이슈가 완화 레인에 보입니다.`,
    },
    {
      title: "메모 레인",
      status: "green",
      detail: `${memos?.length ?? 0}개의 메모가 쌓여 판단을 재사용할 수 있습니다.`,
    },
    {
      title: "패턴 감시",
      status: "warning",
      detail: `${activityLogs?.length ?? 0}개의 최근 활동 이벤트에서 반복 마찰을 확인할 수 있습니다.`,
    },
  ];

  const evolutionEntries = [
    ...(logData.logItems || []).slice(0, 2).map((item) => ({
      title: item.title,
      detail: item.detail,
      time: item.severity === "warning" ? "주의" : "안정",
      tone: item.severity === "warning" ? "warning" : "green",
    })),
    ...(issues || []).slice(0, 1).map((item) => ({
      title: item.title || "이슈",
      detail: `심각도 ${item.severity || "medium"} · 상태 ${item.status || "open"}`,
      time: formatTimestamp(item.created_at),
      tone: item.severity === "critical" || item.severity === "high" ? "danger" : "blue",
    })),
  ].slice(0, 3);
  const visibleEntries = evolutionEntries.length
    ? evolutionEntries
    : [
        {
          title: "학습 루프가 더 많은 신호를 기다리는 중",
          detail: "로그, 이슈, 메모가 쌓이면 가장 최근 이벤트가 먼저 여기 올라옵니다.",
          time: "대기",
          tone: "muted",
        },
      ];

  return (
    <>
      <section className="summary-grid" aria-label="개선 요약 지표">
        {evolutionMetrics.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      <div className="stack">
        <SectionCard
          kicker="Loop"
          title="시스템이 지금 배우는 것"
          description="다음 작업 블록이 시작되기 전에 루프를 짧고 분명하며 행동 가능하게 유지합니다."
          action={
            <Link className="button button-secondary" href="/dashboard/evolution/logs">
              로그 검토
            </Link>
          }
        >
          <div className="project-grid">
            {evolutionSignals.map((item) => (
              <article className="project-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>개선 레인</p>
                  </div>
                  <span className="legend-chip" data-tone={item.status}>
                    {item.status}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="Signals"
            title="최근 학습 이벤트"
            description="개선 탭은 무엇이 바뀌었고, 무엇을 결정했고, 무엇이 아직 닫히지 않았는지 보여줘야 합니다."
          >
            <div className="timeline">
              {visibleEntries.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.tone}>
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
            kicker="Rules"
            title="개선 가드레일"
            description="자기개선 루프를 소음이 아니라 도구로 유지하게 만드는 습관들입니다."
          >
            <ul className="note-list">
              {evolutionRules.map((item) => (
                <li className="note-row" key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <SectionCard
          kicker="Follow-up"
          title="다음에 일어나야 할 일"
          description="다음 액션이 분명하고 수정이 들어갈 자리가 있을 때 루프는 건강합니다."
        >
          <div className="template-grid">
            {visibleEntries.map((item) => (
              <div className="template-row" key={`${item.title}-followup`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
