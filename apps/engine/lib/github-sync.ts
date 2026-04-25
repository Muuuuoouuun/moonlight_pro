import {
  insertIntegrationSyncRun,
  resolveDefaultWorkspaceId,
  upsertIntegrationConnection,
} from "./integration-state";
import { insertSupabaseRecord } from "./supabase-rest";

interface GitHubRepoConfig {
  fullName: string;
  projectId: string | null;
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
  }));
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

function buildRepoSummary(
  repo: GitHubRepoConfig,
  issues: GitHubIssue[],
  pulls: GitHubPullRequest[],
  milestones: GitHubMilestone[],
) {
  const blockedIssues = countBlockedIssues(issues);
  const reviewRequests = pulls.filter((pull) => (pull.requested_reviewers || []).length > 0).length;
  const staleSince = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const staleIssues = issues.filter((issue) => Date.parse(issue.updated_at) < staleSince).length;

  return {
    repository: repo.fullName,
    projectId: repo.projectId,
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
  const summary = buildRepoSummary(repo, issues, pulls, milestones);

  return {
    ok: true,
    repository: repo.fullName,
    summary,
    partialErrors: [issuesResult, pullsResult, milestonesResult]
      .filter((result) => !result.ok)
      .map((result) => ({
        status: result.status,
        error: result.error,
      })),
  };
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

export async function syncGitHubRepositories() {
  const repositories = resolveGitHubRepositories();
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
      errorMessage: "GITHUB_REPOSITORIES is not configured.",
    });

    return {
      status: "preview",
      configured: false,
      message: "GITHUB_REPOSITORIES is not configured.",
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
  const projectUpdateWrites = await writeProjectUpdates(summaries);
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
    repositories: summaries,
    failures,
    persistence: {
      connection,
      syncRun,
      projectUpdateWrites,
    },
  };
}
