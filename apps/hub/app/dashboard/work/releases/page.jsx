import { SectionCard } from "@/components/dashboard/section-card";
import { HubSyncBadge } from "@/components/dashboard/hub-sync-badge";
import {
  NewSinceDot,
  SinceLastVisitProvider,
} from "@/components/dashboard/since-last-visit";
import { formatTimestamp, getReleaseLogPageData } from "@/lib/server-data";

const TYPE_LABEL = {
  feat: "FEAT",
  fix: "FIX",
  refactor: "REFA",
  chore: "CHORE",
  breaking: "BREAK",
};

function ReleaseEntry({ row }) {
  return (
    <article className="hub-releases__entry">
      <header className="hub-releases__entry-head">
        <span className="hub-releases__tag-chip">{row.tagName}</span>
        <span className="hub-releases__entry-repo">{row.repository}</span>
        <NewSinceDot at={row.publishedAt} />
        <span className="hub-releases__entry-time">
          {row.publishedAt ? formatTimestamp(row.publishedAt) : "—"}
        </span>
      </header>

      <h3 className="hub-releases__entry-title">{row.title}</h3>

      {row.bullets.length ? (
        <ul className="hub-releases__entry-body">
          {row.bullets.map((bullet, index) => (
            <li key={`${row.id}-bullet-${index}`}>
              <span className="hub-releases__type-chip" data-kind={bullet.kind}>
                {TYPE_LABEL[bullet.kind] || "CHORE"}
              </span>
              <span>{bullet.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hub-releases__entry-time">릴리스 본문이 비어 있습니다.</p>
      )}

      <footer className="hub-releases__entry-foot">
        {row.author?.login ? (
          <span className="hub-releases__author">
            <span className="hub-releases__author-avatar" aria-hidden="true" />
            {row.author.login}
          </span>
        ) : null}
        {row.source === "auto-changelog" ? (
          <span className="hub-releases__entry-repo">auto-changelog</span>
        ) : null}
        {row.htmlUrl ? (
          <a
            className="hub-releases__link"
            href={row.htmlUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub 열기 →
          </a>
        ) : null}
      </footer>
    </article>
  );
}

export default async function WorkReleasesPage() {
  const {
    weekGroups,
    releaseRows,
    releasedCount,
    autoCount,
    thisWeek,
    githubConnection,
    githubTotals,
    githubLastSyncAt,
    hasGitHubData,
  } = await getReleaseLogPageData();

  const syncTone =
    githubConnection?.tone === "danger"
      ? "danger"
      : githubConnection?.tone === "warning"
        ? "warning"
        : "green";

  return (
    <SinceLastVisitProvider scope="releases">
      <div className="app-page">
        <section className="page-head">
          <p className="eyebrow">Work OS</p>
          <h1>Releases · 패치노트</h1>
          <p>
            GitHub 에 찍힌 릴리스 태그를 주 단위로 묶어 보여주고, 태그가 없는 리포는 머지된 PR 을
            같은 날짜끼리 묶은 auto-changelog 로 대체합니다. 판단의 중심은 언제나 배송된 것들입니다.
          </p>
          <div className="page-head-meta">
            <HubSyncBadge syncAt={githubLastSyncAt} tone={syncTone} label="Last GitHub sync" />
          </div>
        </section>

        <section aria-label="Release summary">
          <ul className="hub-kpi-strip">
            <li className="hub-kpi-strip__cell hub-rim" data-rim="alert">
              <span className="hub-kpi-strip__label">이번 주 배송</span>
              <span className="hub-kpi-strip__value">
                {String(thisWeek).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">릴리스 + auto changelog 합산</span>
            </li>
            <li className="hub-kpi-strip__cell hub-rim" data-rim="default">
              <span className="hub-kpi-strip__label">태그된 릴리스</span>
              <span className="hub-kpi-strip__value">
                {String(releasedCount).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">GitHub 릴리스 엔드포인트 기준</span>
            </li>
            <li className="hub-kpi-strip__cell hub-rim" data-rim="muted">
              <span className="hub-kpi-strip__label">Auto changelog</span>
              <span className="hub-kpi-strip__value">
                {String(autoCount).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">릴리스 없는 리포 폴백</span>
            </li>
            <li className="hub-kpi-strip__cell hub-rim" data-rim="default">
              <span className="hub-kpi-strip__label">이번 주 머지</span>
              <span className="hub-kpi-strip__value">
                {String(githubTotals.mergedPullCount || 0).padStart(2, "0")}
              </span>
              <span className="hub-kpi-strip__meta">
                {hasGitHubData ? "배송 모멘텀 활성" : "GitHub 미연결"}
              </span>
            </li>
          </ul>
        </section>

        <SectionCard
          kicker="Release log"
          title="주 단위 패치노트 레일"
          description="GitHub 릴리스 태그가 우선이고, 태그 없이 머지만 한 리포는 날짜로 묶은 auto-changelog 로 채워 넣습니다."
        >
          {releaseRows.length ? (
            <div className="hub-releases__rail">
              {weekGroups.map((group) => (
                <div className="hub-releases__group" key={group.key}>
                  <header className="hub-releases__group-head">
                    <h2 className="hub-releases__group-title">{group.title}</h2>
                    <span className="hub-releases__group-count">
                      {group.rows.length} entries
                    </span>
                  </header>
                  {group.rows.map((row) => (
                    <ReleaseEntry key={row.id} row={row} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="hub-releases__empty">
              아직 릴리스나 머지 이력이 보이지 않습니다. GitHub 토큰과 리포 설정을 확인해 주세요.
            </p>
          )}
        </SectionCard>
      </div>
    </SinceLastVisitProvider>
  );
}
