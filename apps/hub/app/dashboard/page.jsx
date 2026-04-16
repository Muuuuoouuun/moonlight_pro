import Link from "next/link";
import {
  Button,
  Cluster,
  EmptyState,
  Grid,
  KpiCard,
  MetricWithSpark,
  SectionHeader,
  Stack,
  StatusChip,
  Surface,
} from "@com-moon/ui";
import {
  OperatingPulsePanel,
  OperatingPulseSummaryCards,
} from "@/components/dashboard/operating-pulse";
import { getDashboardPageData, getOperatingPulseData } from "@/lib/server-data";

// Map legacy `tone` strings from dashboard-data.js → StatusChip/KpiDelta tones.
const TONE_MAP = {
  green: "ok",
  warning: "warn",
  danger: "risk",
  blue: "info",
  muted: "neutral",
};

const DELTA_TONE_MAP = {
  green: "up",
  warning: "warn",
  danger: "down",
  blue: "neutral",
  muted: "neutral",
};

function toChipTone(tone) {
  return TONE_MAP[tone] || "neutral";
}

function toDeltaTone(tone) {
  return DELTA_TONE_MAP[tone] || "neutral";
}

export default async function DashboardPage() {
  const [
    {
      activityFeed,
      projectUpdates,
      summaryStats,
      systemChecks,
      todayFocus,
      webhookEndpoints,
    },
    operatingPulse,
  ] = await Promise.all([getDashboardPageData(), getOperatingPulseData()]);

  const attentionStats = summaryStats.slice(0, 4);

  return (
    <Stack gap={6}>
      <Surface tone="feature" as="section" aria-label="오늘의 운영 상태">
        <Stack gap={5}>
          <div>
            <Cluster gap={2}>
              <StatusChip tone="accent">오늘의 판단면</StatusChip>
              <StatusChip tone="ok" plain>
                운영 중
              </StatusChip>
            </Cluster>
            <h1
              style={{
                margin: "14px 0 0",
                fontFamily: "var(--cm-font-sans)",
                fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.15,
                color: "var(--cm-platinum)",
                wordBreak: "keep-all",
                textWrap: "balance",
                maxWidth: "28ch",
              }}
            >
              지금 무엇이 가장 먼저 움직여야 하는가.
            </h1>
            <p
              style={{
                margin: "10px 0 0",
                maxWidth: "58ch",
                fontSize: "0.98rem",
                lineHeight: 1.6,
                color: "var(--cm-platinum-soft)",
                wordBreak: "keep-all",
              }}
            >
              상황판이 아니라 실행면입니다. 숫자보다 다음 행동이 먼저 보이도록
              핵심 신호와 우선순위를 앞에 배치했습니다.
            </p>
          </div>
          <Cluster gap={2}>
            <Link href="/dashboard/daily-brief">
              <Button variant="primary" tabIndex={-1}>
                데일리 브리프 열기
              </Button>
            </Link>
            <Link href="/dashboard/work">
              <Button variant="secondary" surface="dark" tabIndex={-1}>
                워크 OS 열기
              </Button>
            </Link>
            <Link href="/dashboard/content/studio">
              <Button variant="ghost" surface="dark" tabIndex={-1}>
                콘텐츠 스튜디오
              </Button>
            </Link>
          </Cluster>
        </Stack>
      </Surface>

      <section aria-label="운영 지표 스트립">
        <SectionHeader
          eyebrow="핵심 신호"
          title="이번 라운드에서 먼저 볼 지표"
          description="숫자 확인에서 멈추지 않도록 7일 추세를 함께 보여줍니다."
        />
        <Grid cols={4} gap={4} collapse="md">
          {attentionStats.map((stat) => (
            <MetricWithSpark
              key={stat.title}
              label={stat.badge || stat.title}
              value={stat.value}
              detail={stat.detail}
              trend={stat.trend}
              trendLabel={stat.trendLabel}
              delta={stat.tone ? stat.badge : undefined}
              deltaTone={toDeltaTone(stat.tone)}
            />
          ))}
        </Grid>
      </section>

      <section aria-label="기계 펄스">
        <SectionHeader
          eyebrow="기계 펄스"
          title="AI · 자동화 · 시스템 상태"
          description="지금 돌고 있는지, 쉬고 있는지, 오늘 얼마나 움직였는지를 한 화면에서 확인합니다."
        />
        <Stack gap={4}>
          <OperatingPulseSummaryCards pulse={operatingPulse} ariaLabel="기계 펄스 요약" />
          <OperatingPulsePanel pulse={operatingPulse} compact />
        </Stack>
      </section>

      <section aria-label="다음 세 가지 액션">
        <SectionHeader
          eyebrow="다음 3개"
          title="오늘 반드시 처리할 일"
          description="하루를 작게 접어서 가장 중요한 세 가지 행동만 남깁니다."
          action={
            <Link href="/dashboard/playbooks">
              <Button variant="secondary" surface="dark" tabIndex={-1}>
                플레이북 확인
              </Button>
            </Link>
          }
        />
        {todayFocus.length ? (
          <Grid cols={3} gap={4} collapse="md">
            {todayFocus.slice(0, 3).map((item, index) => (
              <Surface tone="panel" key={item.title}>
                <Stack gap={3}>
                  <Cluster gap={2}>
                    <StatusChip tone="accent">
                      {String(index + 1).padStart(2, "0")}
                    </StatusChip>
                    <StatusChip tone="neutral" plain>
                      우선
                    </StatusChip>
                  </Cluster>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--cm-font-sans)",
                      fontSize: "1.08rem",
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      lineHeight: 1.35,
                      color: "var(--cm-platinum)",
                      wordBreak: "keep-all",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.88rem",
                      lineHeight: 1.6,
                      color: "var(--cm-platinum-soft)",
                      wordBreak: "keep-all",
                    }}
                  >
                    {item.detail}
                  </p>
                </Stack>
              </Surface>
            ))}
          </Grid>
        ) : (
          <EmptyState
            title="오늘의 액션이 아직 없습니다"
            description="플레이북에서 오늘의 세 가지 액션을 불러오거나, 데일리 브리프를 다시 작성해보세요."
            action={
              <Link href="/dashboard/daily-brief">
                <Button variant="secondary" surface="dark" tabIndex={-1}>
                  브리프 열기
                </Button>
              </Link>
            }
          />
        )}
      </section>

      <Grid cols={2} gap={5} collapse="md">
        <Stack gap={5}>
          <section aria-label="레인 간 움직임">
            <SectionHeader
              eyebrow="교차 레인"
              title="어디에서 어디로 움직였는지"
              description="작업이 어느 레인에서 발생했고 다음에 어디로 넘어가는지 한 줄로 남깁니다."
              action={
                <Link href="/dashboard/evolution/activity">
                  <Button variant="ghost" surface="dark" tabIndex={-1}>
                    전체 활동 보기
                  </Button>
                </Link>
              }
            />
            <Surface tone="card">
              <Stack gap={3}>
                {activityFeed.length ? (
                  activityFeed.map((item, index) => (
                    <article
                      key={`${item.title}-${item.time}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "var(--cm-space-4)",
                        paddingBottom: "var(--cm-space-3)",
                        borderBottom:
                          index === activityFeed.length - 1
                            ? "none"
                            : "1px solid var(--cm-line-dark)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: "block",
                            fontSize: "0.92rem",
                            fontWeight: 600,
                            color: "var(--cm-platinum)",
                            letterSpacing: "-0.01em",
                            wordBreak: "keep-all",
                          }}
                        >
                          {item.title}
                        </strong>
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: "0.84rem",
                            lineHeight: 1.55,
                            color: "var(--cm-platinum-soft)",
                            wordBreak: "keep-all",
                          }}
                        >
                          {item.detail}
                        </p>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontFamily: "var(--cm-font-mono)",
                          fontSize: "0.72rem",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--cm-platinum-soft)",
                          whiteSpace: "nowrap",
                          paddingTop: 2,
                        }}
                      >
                        {item.time}
                      </span>
                    </article>
                  ))
                ) : (
                <EmptyState
                  title="최근 활동이 없습니다"
                  description="엔진 수신이 열리면 활동 타임라인이 여기에 나타납니다."
                />
              )}
              </Stack>
            </Surface>
          </section>

          <section aria-label="프로젝트 움직임">
            <SectionHeader
              eyebrow="승인과 움직임"
              title="승인 대기 · 프로젝트 움직임"
              description="블로킹이 바쁨 뒤에 숨지 않게, 다음 결정이 명시적으로 남습니다."
              action={
                <Link href="/dashboard/work">
                  <Button variant="ghost" surface="dark" tabIndex={-1}>
                    워크 OS
                  </Button>
                </Link>
              }
            />
            <Stack gap={3}>
              {projectUpdates.length ? (
                projectUpdates.map((item) => (
                  <Surface tone="card" key={item.title}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "var(--cm-space-4)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: "block",
                            fontSize: "0.94rem",
                            fontWeight: 600,
                            color: "var(--cm-platinum)",
                            letterSpacing: "-0.01em",
                            wordBreak: "keep-all",
                          }}
                        >
                          {item.title}
                        </strong>
                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: "0.85rem",
                            lineHeight: 1.6,
                            color: "var(--cm-platinum-soft)",
                            wordBreak: "keep-all",
                          }}
                        >
                          {item.detail}
                        </p>
                      </div>
                      <StatusChip tone={toChipTone(item.tone)}>
                        {item.time}
                      </StatusChip>
                    </div>
                  </Surface>
                ))
              ) : (
                <EmptyState
                  title="대기 중인 승인 없음"
                  description="새로운 결정이 생기면 이곳에 표시됩니다."
                />
              )}
            </Stack>
          </section>
        </Stack>

        <Stack gap={5}>
          <section aria-label="시스템 상태">
            <SectionHeader
              eyebrow="시스템"
              title="허브 쉘 상태"
              description="운영 면이 살아 있는지 먼저 확인합니다. 숨은 고장은 이 블록에서 드러납니다."
            />
            <Grid cols={2} gap={3} collapse="sm">
              {systemChecks.map((item) => (
                <KpiCard
                  key={item.title}
                  label={item.title}
                  value={item.value}
                  detail={item.detail}
                />
              ))}
            </Grid>
          </section>

          <section aria-label="엔진 수신">
            <SectionHeader
              eyebrow="엔진"
              title="웹훅 수신 상태"
              description="수신 경로가 막히면 운영 루프가 멈춥니다. 경로별 상태를 먼저 노출합니다."
              action={
                <Link href="/dashboard/automations/webhooks">
                  <Button variant="ghost" surface="dark" tabIndex={-1}>
                    전체 보기
                  </Button>
                </Link>
              }
            />
            <Surface tone="card">
              <Stack gap={3}>
                {webhookEndpoints.length ? (
                  webhookEndpoints.map((item, index) => (
                    <div
                      key={item.name}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "var(--cm-space-3)",
                        paddingBottom: "var(--cm-space-3)",
                        borderBottom:
                          index === webhookEndpoints.length - 1
                            ? "none"
                            : "1px solid var(--cm-line-dark)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: "block",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            color: "var(--cm-platinum)",
                          }}
                        >
                          {item.name}
                        </strong>
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: "0.82rem",
                            lineHeight: 1.5,
                            color: "var(--cm-platinum-soft)",
                            wordBreak: "keep-all",
                          }}
                        >
                          {item.note}
                        </p>
                      </div>
                      <Cluster gap={2}>
                        <StatusChip tone="info" plain>
                          {item.method}
                        </StatusChip>
                      </Cluster>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="등록된 수신 경로가 없습니다"
                    description="엔진에 웹훅 경로를 연결하면 이곳에 나타납니다."
                  />
                )}
              </Stack>
            </Surface>
          </section>
        </Stack>
      </Grid>
    </Stack>
  );
}
