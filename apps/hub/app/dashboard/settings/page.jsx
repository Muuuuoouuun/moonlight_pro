import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import {
  boolFilter,
  countRows,
  fetchRows,
  formatTimestamp,
  getDashboardPageData,
  getLocalProjectRepositoryData,
  inFilter,
} from "@/lib/server-data";

export const dynamic = "force-dynamic";

function isSet(value) {
  return Boolean(value && String(value).trim());
}

function countLabel(value) {
  return value == null ? "MVP" : String(value);
}

function countTone(value) {
  if (value == null) {
    return "warning";
  }

  return value > 0 ? "green" : "muted";
}

function envTone(value) {
  return isSet(value) ? "green" : "danger";
}

function envLabel(value) {
  return isSet(value) ? "설정됨" : "누락";
}

function stateLabel(value) {
  if (value == null) {
    return "폴백";
  }

  if (value > 0) {
    return "실시간";
  }

  return "비어 있음";
}

export default async function SettingsPage() {
  const localRepositoryData = getLocalProjectRepositoryData();
  const [
    dashboardData,
    integrationConnections,
    connectedConnections,
    pendingConnections,
    errorConnections,
    webhookCount,
    activeApiKeys,
    secretRotations,
    syncRuns,
    failedSyncRuns,
    exportFailures,
    unresolvedErrors,
    projectCount,
    contentCount,
    leadCount,
  ] = await Promise.all([
    getDashboardPageData(),
    countRows("integration_connections"),
    countRows("integration_connections", [["status", "eq.connected"]]),
    countRows("integration_connections", [["status", "eq.pending"]]),
    countRows("integration_connections", [["status", "eq.error"]]),
    countRows("webhook_endpoints"),
    countRows("api_keys", [["is_active", boolFilter(true)]]),
    countRows("secret_rotations"),
    countRows("sync_runs"),
    countRows("sync_runs", [["status", "eq.failure"]]),
    countRows("export_logs", [["status", "eq.failed"]]),
    countRows("error_logs", [["resolved", boolFilter(false)]]),
    countRows("projects", [["status", inFilter(["active", "blocked"])]]),
    countRows("content_items"),
    countRows("leads", [["status", inFilter(["new", "qualified", "nurturing"])]]),
  ]);

  const recentSyncRuns = await fetchRows("sync_runs", { limit: 4, order: "started_at.desc" });
  const recentExports = await fetchRows("export_logs", { limit: 4, order: "created_at.desc" });

  const envChecks = [
    { title: "Supabase URL", detail: "Database read path for live posture checks.", value: process.env.SUPABASE_URL },
    {
      title: "Supabase role key",
      detail: "Required for read-only row counts and delivery health.",
      value: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    },
    {
      title: "GitHub token",
      detail: "Used for GitHub-backed PMS and roadmap visibility.",
      value: process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GH_TOKEN,
    },
    {
      title: "GitHub repos",
      detail: "Repository map for the delivery cockpit.",
      value: process.env.GITHUB_REPOSITORIES,
    },
    {
      title: "Projects root",
      detail: "Local project root used to auto-map workspace repositories.",
      value: process.env.COM_MOON_PROJECTS_ROOT || "/Users/bigmac_moon/Desktop/Projects",
    },
    {
      title: "Engine URL",
      detail: "Used when the shell can see health and route posture.",
      value: process.env.COM_MOON_ENGINE_URL || process.env.NEXT_PUBLIC_APP_URL,
    },
    {
      title: "Runtime",
      detail: "Settings page is rendering from the live server runtime.",
      value: process.env.NODE_ENV || "development",
    },
  ];

  const envReadyCount = envChecks.filter((item) => isSet(item.value)).length;
  const liveSourceCount = [projectCount, contentCount, leadCount, webhookCount, syncRuns].filter(
    (value) => value != null,
  ).length;
  const safeguardCount = [activeApiKeys, secretRotations, exportFailures, unresolvedErrors].filter(
    (value) => value != null,
  ).length;

  const sourceRows = [
    {
      title: "Projects",
      count: projectCount,
      detail: "Active and blocked work stay visible for delivery planning.",
      note: "Work OS",
    },
    {
      title: "Content items",
      count: contentCount,
      detail: "Drafts, reviews, and published rows feed the content lanes.",
      note: "Content",
    },
    {
      title: "Leads",
      count: leadCount,
      detail: "Working funnel rows surface revenue motion before it goes stale.",
      note: "Revenue",
    },
    {
      title: "Webhook endpoints",
      count: webhookCount,
      detail: "Intake routes stay explicit so integrations are easy to audit.",
      note: "Automations",
    },
    {
      title: "Sync runs",
      count: syncRuns,
      detail: "Sync activity shows whether the engine is actually moving data.",
      note: "Engine",
    },
  ];

  const safeguardRows = [
    {
      title: "Secret rotation audit",
      detail: `${countLabel(secretRotations)} rotation records captured for this workspace.`,
      tone: countTone(secretRotations),
    },
    {
      title: "Active API keys",
      detail: `${countLabel(activeApiKeys)} keys remain active for integrations and internal tools.`,
      tone: countTone(activeApiKeys),
    },
    {
      title: "Export trail",
      detail: `${countLabel(exportFailures)} failed export records need review before release work resumes.`,
      tone: exportFailures == null ? "warning" : exportFailures > 0 ? "danger" : "green",
    },
    {
      title: "Open errors",
      detail: `${countLabel(unresolvedErrors)} unresolved error logs remain in the learning loop.`,
      tone: unresolvedErrors == null ? "warning" : unresolvedErrors > 0 ? "danger" : "green",
    },
  ];

  const liveRoutes = dashboardData.webhookEndpoints?.slice(0, 4) || [];
  const systemChecks = dashboardData.systemChecks || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">설정</p>
        <h1>환경, 설정, 운영 가드레일</h1>
        <p>
          이 페이지는 셸의 상태 점검용 관제실입니다. 무엇이 설정되었는지, 무엇이 연결 준비가 되었는지,
          어떤 데이터 소스가 살아 있는지, 어디에 가드레일이 더 필요한지 보여줍니다.
        </p>
        <p className="page-context">
          <strong>{`${envReadyCount}/${envChecks.length}개 환경 점검 준비`}</strong>
          <span>
            {dashboardData.systemChecks?.length
              ? `${dashboardData.systemChecks.length}개의 실시간 셸 점검을 지금 읽을 수 있습니다.`
              : "실시간 헬스를 읽을 수 있을 때까지 시스템 점검은 목업 상태로 폴백됩니다."}
          </span>
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/dashboard/automations/integrations">
            연동 열기
          </Link>
          <Link className="button button-secondary" href="/dashboard/evolution/logs">
            로그 검토
          </Link>
          <Link className="button button-ghost" href="/dashboard/work/pms">
            PMS 열기
          </Link>
        </div>
      </section>

      <section className="summary-grid" aria-label="설정 요약 지표">
        <SummaryCard
          title="환경"
          value={`${envReadyCount}/${envChecks.length}`}
          detail="허브 셸과 GitHub 전달 레인을 위한 읽기 전용 환경 상태입니다."
          badge="설정됨"
          tone={envReadyCount === envChecks.length ? "green" : "warning"}
        />
        <SummaryCard
          title="연동"
          value={countLabel(connectedConnections)}
          detail="연결된 연동은 시스템이 준비됐다는 첫 신호입니다."
          badge={countLabel(integrationConnections)}
          tone={connectedConnections == null ? "warning" : "blue"}
        />
        <SummaryCard
          title="프로젝트 저장소"
          value={String(localRepositoryData.totals.connectedRepositoryCount)}
          detail="Projects 워크스페이스에서 허브 셸로 매핑된 로컬 저장소 수입니다."
          badge={String(localRepositoryData.totals.trackedProjectCount)}
          tone="green"
        />
        <SummaryCard
          title="데이터 소스"
          value={countLabel(liveSourceCount)}
          detail="프로젝트, 콘텐츠, 매출, 웹훅, 동기화 레인을 읽을 수 있습니다."
          badge="실시간"
          tone={liveSourceCount > 0 ? "green" : "warning"}
        />
        <SummaryCard
          title="가드레일"
          value={countLabel(safeguardCount)}
          detail="시크릿, 익스포트, 에러 처리가 번지기 전에 눈에 보이도록 유지합니다."
          badge="보호"
          tone={unresolvedErrors > 0 || exportFailures > 0 ? "warning" : "green"}
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="환경"
          title="설정 상태"
          description="설정 화면은 아직 연결이 필요한 것만이 아니라, 셸이 이미 신뢰할 수 있는 것까지 보여줘야 합니다."
        >
          <div className="template-grid">
            {envChecks.map((item) => (
              <div className="template-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={envTone(item.value)}>
                  {envLabel(item.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="timeline" style={{ marginTop: "1rem" }}>
            {systemChecks.length ? (
              systemChecks.map((item) => (
                <div className="timeline-item" key={item.title}>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone="blue">
                      실시간 점검
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <span className="muted tiny">{item.value}</span>
                </div>
              ))
            ) : (
              <div className="timeline-item">
                <strong>헬스 라우트 대기 중</strong>
                <p>셸이 아직 실시간 엔진 헬스 신호를 기다리고 있습니다.</p>
                <span className="muted tiny">목업</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          kicker="연동"
          title="준비 상태와 인입"
          description="이 레인은 하나의 질문에 답합니다. 어떤 연결을 전달 사이클에서 신뢰할 수 있는가?"
        >
          <div className="project-grid">
            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>연결 상태</h3>
                  <p>GitHub, 엔진, 내부 동기화 경로.</p>
                </div>
                <span className="legend-chip" data-tone="blue">
                  {countLabel(connectedConnections)}/{countLabel(integrationConnections)}
                </span>
              </div>
              <dl className="detail-stack">
                <div>
                  <dt>연결됨</dt>
                  <dd>{countLabel(connectedConnections)}개의 연동 연결이 활성 상태입니다.</dd>
                </div>
                <div>
                  <dt>대기</dt>
                  <dd>{countLabel(pendingConnections)}개의 연동은 아직 설정이나 매핑이 필요합니다.</dd>
                </div>
                <div>
                  <dt>에러</dt>
                  <dd>{countLabel(errorConnections)}개의 연결은 다음 런 전에 점검이 필요합니다.</dd>
                </div>
                <div>
                  <dt>실패한 동기화</dt>
                  <dd>{countLabel(failedSyncRuns)}개의 런에 아직 후속 조치가 필요합니다.</dd>
                </div>
              </dl>
            </article>

            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>라우트 스냅샷</h3>
                  <p>셸에서 보이는 웹훅과 동기화.</p>
                </div>
                <span className="legend-chip" data-tone={countTone(webhookCount)}>
                  {stateLabel(webhookCount)}
                </span>
              </div>
              <div className="timeline">
                {liveRoutes.length ? (
                  liveRoutes.map((item) => (
                    <div className="timeline-item" key={item.name}>
                      <div className="inline-legend">
                        <span className="legend-chip" data-tone={item.tone || "blue"}>
                          {item.status}
                        </span>
                      </div>
                      <strong>{item.name}</strong>
                      <p>{item.note}</p>
                    </div>
                  ))
                ) : (
                  <div className="timeline-item">
                    <strong>아직 웹훅 라우트가 없습니다</strong>
                    <p>연동 레이어가 등록되면 경로가 여기에 나타납니다.</p>
                    <span className="muted tiny">목업</span>
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="timeline" style={{ marginTop: "1rem" }}>
            {(recentSyncRuns?.length ? recentSyncRuns : []).slice(0, 4).map((item) => (
              <div className="timeline-item" key={item.id || `${item.status}-${item.started_at}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.status === "success" ? "green" : item.status === "failure" ? "danger" : "warning"}>
                    {item.status}
                  </span>
                </div>
                <strong>{item.connection_id ? `동기화 런 ${item.connection_id}` : "동기화 런"}</strong>
                <p>{item.error_message || "인입 가시성을 위해 런 이력을 기록했습니다."}</p>
                <span className="muted tiny">{formatTimestamp(item.finished_at || item.started_at)}</span>
              </div>
            ))}
            {!recentSyncRuns?.length ? (
              <div className="timeline-item">
                <strong>동기화 이력이 데이터를 기다리는 중</strong>
                <p>동기화가 한 번이라도 돌면 가장 최근 런이 상태와 시간과 함께 여기 나타납니다.</p>
                <span className="muted tiny">목업</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="데이터 소스"
          title="소스 상태와 범위"
          description="어떤 소스가 실시간이고, 어떤 소스가 일부만 연결됐고, 어떤 소스가 아직 목업인지 분명히 보여줘야 합니다."
        >
          <div className="project-grid">
            {sourceRows.map((item) => (
              <article className="project-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.note}</p>
                  </div>
                  <span className="legend-chip" data-tone={countTone(item.count)}>
                    {stateLabel(item.count)}
                  </span>
                </div>
                <p className="summary-value" style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>
                  {countLabel(item.count)}
                </p>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="프로젝트"
          title="워크스페이스 저장소 매핑"
          description="이 로컬 저장소들은 워크 OS 컨텍스트를 실제 프로젝트 작업과 GitHub 원격 저장소에 가장 빠르게 묶는 경로입니다."
        >
          <div className="template-grid">
            {localRepositoryData.projects.map((item) => (
              <div className="template-row" key={item.contextValue}>
                <div>
                  <strong>{item.contextLabel}</strong>
                  <p>{item.repository || "아직 원격 저장소가 감지되지 않았습니다."}</p>
                  <p>{item.detail}</p>
                  <p>{item.path}</p>
                </div>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.statusTone}>
                    {item.statusLabel}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {item.branch || "브랜치 없음"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="가드레일"
          title="운영 계약"
          description="이 페이지는 연동이나 데이터가 비어도 셸을 안전하게 유지하는 규칙을 담아야 합니다."
        >
          <ul className="note-list">
            {safeguardRows.map((item) => (
              <li className="note-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.tone === "danger" ? "주의" : item.tone === "warning" ? "검토" : "준비"}
                </span>
              </li>
            ))}
          </ul>

          <div className="template-grid" style={{ marginTop: "1rem" }}>
            <div className="template-row">
              <div>
                <strong>기본은 읽기 전용</strong>
                <p>설정 화면은 운영 상태를 점검하되 실제 운영 상태를 바꾸지 않아야 합니다.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                켜짐
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>시크릿은 가림 처리</strong>
                <p>여기에는 원본 자격증명이 아니라 준비 상태만 보여야 합니다.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                켜짐
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>폴백 모드</strong>
                <p>실데이터가 없을 때도 목업 레인이 운영자의 방향감을 유지해줍니다.</p>
              </div>
              <span className="legend-chip" data-tone="warning">
                준비
              </span>
            </div>
          </div>

          <div className="timeline" style={{ marginTop: "1rem" }}>
            {(recentExports?.length ? recentExports : []).map((item) => (
              <div className="timeline-item" key={item.id || `${item.status}-${item.created_at}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.status === "completed" ? "green" : item.status === "failed" ? "danger" : "warning"}>
                    {item.status}
                  </span>
                </div>
                <strong>{item.export_type || "익스포트"}</strong>
                <p>{item.status === "failed" ? "익스포트가 실패해 운영자 검토가 필요합니다." : "감사 가능성을 위해 익스포트 이력을 기록했습니다."}</p>
                <span className="muted tiny">{formatTimestamp(item.created_at)}</span>
              </div>
            ))}
            {!recentExports?.length ? (
              <div className="timeline-item">
                <strong>아직 익스포트 로그가 없습니다</strong>
                <p>익스포트 액션이 생기면 가장 최신 감사 항목이 이 레인에 표시됩니다.</p>
                <span className="muted tiny">목업</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="목업"
        title="다음 설정 화면"
        description="기본 상태 점검 화면이 안정되면 다음으로 키워갈 제어 항목들입니다."
      >
        <div className="project-grid">
          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>접근 권한과 역할</h3>
                <p>누가 셸에서 보고, 수정하고, 승인하고, 익스포트할 수 있는지.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                예정
              </span>
            </div>
            <p className="check-detail">장기적으로는 관리자 액션, 승인, 제한 패널을 이 레이어가 다뤄야 합니다.</p>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>백업과 익스포트</h3>
                <p>스냅샷, 복원, 데이터 이동성 제어.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                예정
              </span>
            </div>
            <p className="check-detail">익스포트는 항상 로그에 남고, 복원 경로는 필요해지기 전에 분명해야 합니다.</p>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>알림 라우팅</h3>
                <p>동기화 실패, 웹훅 에러, 미해결 로그가 다음에 어디로 가는지.</p>
              </div>
              <span className="legend-chip" data-tone="warning">
                MVP
              </span>
            </div>
            <p className="check-detail">처음에는 셸에서 시작하고, 핵심 루프가 안정되면 알림 채널을 키우면 됩니다.</p>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>정책 팩</h3>
                <p>콘텐츠, 연동, 전달을 위한 안전한 기본 운영 규칙.</p>
              </div>
              <span className="legend-chip" data-tone="muted">
                스펙
              </span>
            </div>
            <p className="check-detail">정책 팩은 반복되는 판단을 재사용 가능한 가드레일로 바꿔줍니다.</p>
          </article>
        </div>
      </SectionCard>
    </div>
  );
}
