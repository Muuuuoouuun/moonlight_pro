import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "./integration-state";
import { ciTransitionUpdate, summarizeCheckRuns } from "./github-signals.ts";
import type { RepositoryLink } from "./github-signals.ts";
import { fetchSupabaseRows, insertSupabaseRecord, updateSupabaseRecord } from "./supabase-rest";

// 저장소 목록의 정본은 product_repositories(제품 렌즈 §5.1)다. 환경 변수 GITHUB_REPOSITORIES·
// GITHUB_PROJECT_MAP은 테이블이 비었거나 아직 없을 때만 쓰는 읽기 폴백이다.
interface GitHubRepoConfig {
  fullName: string;
  projectId: string | null;
  productId: string | null;
  repositoryId: string | null;
  defaultBranch: string | null;
  lastSummary: Record<string, unknown>;
}

interface GitHubApiResult<T> {
  ok: boolean;
  status: number | null;
  data: T | null;
  error?: string;
}

type GitHubLabel = string | { name?: string | null };

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  labels?: GitHubLabel[];
  pull_request?: unknown;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  draft?: boolean;
  requested_reviewers?: Array<{ login?: string | null }>;
}

interface GitHubMilestone {
  number: number;
  title: string;
  state: string;
  html_url: string;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
}

type GitHubRepoSummary = ReturnType<typeof buildRepoSummary>;
type GitHubRepositorySyncResult =
  | {
      ok: true;
      repository: string;
      summary: GitHubRepoSummary;
      partialErrors: Array<{
        status: number | null;
        error?: string;
      }>;
    }
  | {
      ok: false;
      repository: string;
      status: number | null;
      error: string;
    };

function normalizeApiBaseUrl() {
  return (process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com").replace(/\/$/, "");
}

function normalizeRepo(value: string) {
  return value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
}

function parseProjectMap() {
  const raw = process.env.GITHUB_PROJECT_MAP?.trim() || "";
  const map = new Map<string, string>();

  raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separator = entry.includes("=") ? "=" : ":";
      const [repo, projectId] = entry.split(separator).map((part) => part.trim());
      if (repo && projectId) {
        map.set(normalizeRepo(repo).toLowerCase(), projectId);
      }
    });

  return map;
}

export function resolveGitHubRepositories(): GitHubRepoConfig[] {
  const projectMap = parseProjectMap();
  const repos = (process.env.GITHUB_REPOSITORIES?.trim() || "")
    .split(",")
    .map(normalizeRepo)
    .filter((repo) => /^[^/\s]+\/[^/\s]+$/.test(repo));

  return Array.from(new Set(repos)).map((fullName) => ({
    fullName,
    projectId: projectMap.get(fullName.toLowerCase()) || null,
    productId: null,
    repositoryId: null,
    defaultBranch: null,
    lastSummary: {},
  }));
}

// 제품에 연결된 저장소(disabled 제외). 읽기 실패·테이블 없음은 null — 호출자가 환경 변수로 폴백한다.
async function resolveLinkedRepositories(workspaceId: string | null): Promise<GitHubRepoConfig[] | null> {
  if (!workspaceId) return null;
  const rows = await fetchSupabaseRows("product_repositories", {
    filters: [["workspace_id", `eq.${workspaceId}`], ["status", "neq.disabled"]],
    order: "created_at.asc",
    limit: 100,
  });
  if (rows === null) return null;
  return rows.map((row) => ({
    fullName: String(row.full_name),
    projectId: null,
    productId: String(row.product_id),
    repositoryId: String(row.id),
    defaultBranch: String(row.default_branch || "main"),
    lastSummary: row.last_summary && typeof row.last_summary === "object" ? row.last_summary : {},
  }));
}

async function resolveSyncTargets() {
  const linked = await resolveLinkedRepositories(resolveDefaultWorkspaceId());
  if (linked && linked.length) return { source: "product_repositories" as const, repositories: linked };
  return { source: "env" as const, repositories: resolveGitHubRepositories() };
}

export function getGitHubIntegrationStatus() {
  const repositories = resolveGitHubRepositories();

  return {
    configured: repositories.length > 0,
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
    apiBaseUrl: normalizeApiBaseUrl(),
    repositories: repositories.map((repo) => ({
      fullName: repo.fullName,
      projectMapped: Boolean(repo.projectId),
    })),
  };
}

function makeGitHubHeaders() {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "com-moon-engine",
    "x-github-api-version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN?.trim();

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchGitHubJson<T>(path: string): Promise<GitHubApiResult<T>> {
  try {
    const response = await fetch(`${normalizeApiBaseUrl()}${path}`, {
      headers: makeGitHubHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? (data as T) : null,
      error: response.ok ? undefined : data?.message || text || `http-${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function labelNames(labels: GitHubLabel[] = []) {
  return labels
    .map((label) => (typeof label === "string" ? label : label.name || ""))
    .map((label) => label.toLowerCase())
    .filter(Boolean);
}

function countBlockedIssues(issues: GitHubIssue[]) {
  return issues.filter((issue) => {
    const labels = labelNames(issue.labels);
    return labels.some((label) => label.includes("block") || label.includes("risk"));
  }).length;
}

interface GitHubCheckRunsResponse {
  check_runs?: unknown[];
}

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  html_url?: string;
  published_at?: string | null;
}

function buildRepoSummary(
  repo: GitHubRepoConfig,
  issues: GitHubIssue[],
  pulls: GitHubPullRequest[],
  milestones: GitHubMilestone[],
  ci: ReturnType<typeof summarizeCheckRuns> | null = null,
  release: GitHubRelease | null = null,
  defaultBranch: string | null = null,
) {
  const blockedIssues = countBlockedIssues(issues);
  const reviewRequests = pulls.filter((pull) => (pull.requested_reviewers || []).length > 0).length;
  const staleSince = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const staleIssues = issues.filter((issue) => Date.parse(issue.updated_at) < staleSince).length;

  const reviewWaitSince = Date.now() - 1000 * 60 * 60 * 24 * 3;
  const bugIssues = issues.filter((issue) => labelNames(issue.labels).some((label) => label.includes("bug")));

  return {
    repository: repo.fullName,
    projectId: repo.projectId,
    productId: repo.productId,
    defaultBranch,
    ci,
    latestRelease: release?.tag_name
      ? { tag: release.tag_name, name: release.name || release.tag_name, url: release.html_url || null, at: release.published_at || null }
      : null,
    // 제품 점수 코드 건강 축의 입력(§9): 3일 넘은 리뷰 대기 PR, 7일 넘은 bug 이슈.
    staleReviewRequests: pulls.filter((pull) => (pull.requested_reviewers || []).length > 0 && Date.parse(pull.updated_at) < reviewWaitSince).length,
    staleBugIssues: bugIssues.filter((issue) => Date.parse(issue.updated_at) < staleSince).length,
    openIssues: issues.length,
    openPullRequests: pulls.length,
    reviewRequests,
    blockedIssues,
    staleIssues,
    openMilestones: milestones.length,
    nextMilestone: milestones[0]
      ? {
          title: milestones[0].title,
          dueOn: milestones[0].due_on,
          openIssues: milestones[0].open_issues,
          closedIssues: milestones[0].closed_issues,
          url: milestones[0].html_url,
        }
      : null,
    topIssues: issues.slice(0, 5).map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      updatedAt: issue.updated_at,
      labels: labelNames(issue.labels),
    })),
    topPullRequests: pulls.slice(0, 5).map((pull) => ({
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      updatedAt: pull.updated_at,
      draft: Boolean(pull.draft),
      requestedReviewers: (pull.requested_reviewers || [])
        .map((reviewer) => reviewer.login)
        .filter(Boolean),
    })),
  };
}

async function syncRepository(repo: GitHubRepoConfig): Promise<GitHubRepositorySyncResult> {
  const [repoResult, issuesResult, pullsResult, milestonesResult] = await Promise.all([
    fetchGitHubJson<Record<string, unknown>>(`/repos/${repo.fullName}`),
    fetchGitHubJson<GitHubIssue[]>(
      `/repos/${repo.fullName}/issues?state=open&sort=updated&direction=desc&per_page=30`,
    ),
    fetchGitHubJson<GitHubPullRequest[]>(
      `/repos/${repo.fullName}/pulls?state=open&sort=updated&direction=desc&per_page=30`,
    ),
    fetchGitHubJson<GitHubMilestone[]>(
      `/repos/${repo.fullName}/milestones?state=open&sort=due_on&direction=asc&per_page=10`,
    ),
  ]);

  if (!repoResult.ok) {
    return {
      ok: false,
      repository: repo.fullName,
      status: repoResult.status,
      error: repoResult.error || "repo-fetch-failed",
    };
  }

  const issues = (issuesResult.data || []).filter((issue) => !issue.pull_request);
  const pulls = pullsResult.data || [];
  const milestones = milestonesResult.data || [];
  const defaultBranch = repo.defaultBranch
    || (typeof repoResult.data?.default_branch === "string" ? repoResult.data.default_branch : null)
    || "main";
  // 기본 브랜치 최신 커밋의 check 상태와 최신 릴리스(§5.2 폴링). 릴리스 404는 "릴리스 없음"이다.
  const [checksResult, releaseResult] = await Promise.all([
    fetchGitHubJson<GitHubCheckRunsResponse>(
      `/repos/${repo.fullName}/commits/${encodeURIComponent(defaultBranch)}/check-runs?per_page=50`,
    ),
    fetchGitHubJson<GitHubRelease>(`/repos/${repo.fullName}/releases/latest`),
  ]);
  const ci = checksResult.ok ? summarizeCheckRuns(checksResult.data?.check_runs || []) : null;
  const release = releaseResult.ok ? releaseResult.data : null;
  const summary = buildRepoSummary(repo, issues, pulls, milestones, ci, release, defaultBranch);

  return {
    ok: true,
    repository: repo.fullName,
    summary,
    partialErrors: [issuesResult, pullsResult, milestonesResult, checksResult,
      ...(releaseResult.status === 404 ? [] : [releaseResult])]
      .filter((result) => !result.ok)
      .map((result) => ({
        status: result.status,
        error: result.error,
      })),
  };
}

// 제품에 연결된 저장소는 요약을 행에 적고(last_summary·last_synced_at·status), CI 상태가 바뀌었을 때만
// 제품 신호 행을 하나 남긴다. 폴링마다 쌓이던 "GitHub sync" 요약 행은 환경 변수 폴백 저장소에만 남긴다.
async function writeLinkedRepositoryState(
  repositories: GitHubRepoConfig[],
  results: GitHubRepositorySyncResult[],
  finishedAt: string,
) {
  const workspaceId = resolveDefaultWorkspaceId();
  if (!workspaceId) return [];
  return Promise.all(results.map(async (result, index) => {
    const repo = repositories[index];
    if (!repo?.repositoryId || !repo.productId) return null;
    const filters: Array<[string, string]> = [["id", `eq.${repo.repositoryId}`], ["workspace_id", `eq.${workspaceId}`]];
    if (!result.ok) {
      const write = await updateSupabaseRecord("product_repositories", filters, {
        status: "error",
        last_error: `${result.status ?? "network"} · ${result.error}`.slice(0, 1000),
        updated_at: finishedAt,
      });
      return { repository: repo.fullName, repositoryState: write.persisted ? "saved" : write.reason };
    }
    const { summary } = result;
    const link: RepositoryLink = {
      product_id: repo.productId,
      full_name: repo.fullName,
      default_branch: summary.defaultBranch || repo.defaultBranch || "main",
      last_summary: repo.lastSummary,
    };
    const transition = summary.ci ? ciTransitionUpdate(link, summary.ci) : null;
    const signal = transition
      ? await insertSupabaseRecord("project_updates", {
          workspace_id: workspaceId,
          project_id: null,
          product_id: repo.productId,
          source: "github",
          ...transition,
          happened_at: finishedAt,
        })
      : null;
    const write = await updateSupabaseRecord("product_repositories", filters, {
      status: "connected",
      last_error: null,
      last_synced_at: finishedAt,
      last_summary: {
        ...repo.lastSummary,
        ...(summary.ci ? { ci: { ...summary.ci, at: finishedAt, source: "poll" } } : {}),
        ...(summary.latestRelease ? { latestRelease: summary.latestRelease } : {}),
        openIssues: summary.openIssues,
        openPullRequests: summary.openPullRequests,
        reviewRequests: summary.reviewRequests,
        staleReviewRequests: summary.staleReviewRequests,
        staleBugIssues: summary.staleBugIssues,
        blockedIssues: summary.blockedIssues,
        topPullRequests: summary.topPullRequests,
      },
      updated_at: finishedAt,
    });
    return {
      repository: repo.fullName,
      repositoryState: write.persisted ? "saved" : write.reason,
      ...(signal ? { signal: signal.persisted ? "saved" : signal.reason } : {}),
    };
  }));
}

async function writeProjectUpdates(summaries: Array<ReturnType<typeof buildRepoSummary>>) {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return [];
  }

  const now = new Date().toISOString();
  const writes = await Promise.all(
    summaries.map((summary) =>
      insertSupabaseRecord("project_updates", {
        workspace_id: workspaceId,
        project_id: summary.projectId,
        source: "github",
        event_type: "github.sync",
        status: summary.blockedIssues > 0 ? "blocked" : "reported",
        title: `GitHub sync: ${summary.repository}`,
        summary: [
          `${summary.openIssues} open issues`,
          `${summary.openPullRequests} open PRs`,
          `${summary.reviewRequests} review requests`,
          `${summary.blockedIssues} blocked/risk items`,
        ].join(" · "),
        progress: null,
        milestone: summary.nextMilestone?.title || null,
        next_action:
          summary.reviewRequests > 0
            ? "Review requested pull requests."
            : summary.blockedIssues > 0
              ? "Unblock the highest-risk GitHub issue."
              : "Keep the delivery lane moving.",
        payload: summary,
        happened_at: now,
      }),
    ),
  );

  return writes;
}

// 상세 상태(GET·Hub 화면용) — 테이블 연결 저장소 수까지 센다. health는 동기 getGitHubIntegrationStatus를 쓴다.
export async function getGitHubIntegrationStatusDetailed() {
  const envStatus = getGitHubIntegrationStatus();
  const linked = await resolveLinkedRepositories(resolveDefaultWorkspaceId());
  return {
    ...envStatus,
    configured: Boolean(linked?.length) || envStatus.configured,
    source: linked?.length ? "product_repositories" : envStatus.configured ? "env" : "none",
    linkedRepositories: linked === null ? null : linked.length,
    webhookSecretConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET?.trim()),
  };
}

export async function syncGitHubRepositories() {
  const targets = await resolveSyncTargets();
  const repositories = targets.repositories;
  const startedAt = new Date().toISOString();

  if (!repositories.length) {
    const connection = await upsertIntegrationConnection({
      provider: "github",
      status: "pending",
      config: getGitHubIntegrationStatus(),
      lastSyncedAt: null,
    });

    await insertIntegrationSyncRun({
      provider: "github",
      connectionId: connection.connection?.id || null,
      status: "failure",
      payload: {
        startedAt,
        reason: "missing-repositories",
      },
      errorMessage: "No repository is connected to a product and GITHUB_REPOSITORIES is not configured.",
    });

    return {
      status: "preview",
      configured: false,
      message: "제품에 연결된 저장소가 없습니다.",
      repositories: [],
    };
  }

  const results = await Promise.all(repositories.map(syncRepository));
  const summaries = results
    .filter((result): result is Extract<typeof result, { ok: true }> => result.ok)
    .map((result) => result.summary);
  const failures = results.filter((result) => !result.ok);
  const connected = summaries.length > 0 && failures.length === 0;
  const finishedAt = new Date().toISOString();
  const connection = await upsertIntegrationConnection({
    provider: "github",
    status: summaries.length ? "connected" : "error",
    config: {
      ...getGitHubIntegrationStatus(),
      lastResult: {
        syncedRepositories: summaries.length,
        failedRepositories: failures.length,
      },
    },
    lastSyncedAt: summaries.length ? finishedAt : null,
  });
  const projectUpdateWrites = targets.source === "env"
    ? await writeProjectUpdates(summaries)
    : await writeLinkedRepositoryState(repositories, results, finishedAt);
  const syncRun = await insertIntegrationSyncRun({
    provider: "github",
    connectionId: connection.connection?.id || null,
    status: failures.length && !summaries.length ? "failure" : "success",
    payload: {
      startedAt,
      finishedAt,
      summaries,
      failures,
      projectUpdateWrites,
    },
    errorMessage: failures.length ? `${failures.length} repository sync failures` : null,
  });

  return {
    status: connected ? "synced" : summaries.length ? "partial" : "error",
    configured: true,
    source: targets.source,
    repositories: summaries,
    failures,
    persistence: {
      connection,
      syncRun,
      projectUpdateWrites,
    },
  };
}
