// GitHub PR → 프로젝트 할 일 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §5.3,
// 2026-10-18 운영자 결정: PR 기준 · 표시 + 완료 버튼).
//
// - 대상 저장소: 프로젝트 meta.github.repo로 직접 연결한 저장소, 그리고 제품 탭에 연결한 저장소
//   (그 제품의 열린 프로젝트가 하나일 때). 한 저장소에 프로젝트가 여럿이면 추측하지 않고 건너뛴다.
// - 열린 PR → 할 일 하나(draft는 todo, 그 외 doing). 할 일 meta.github_pr에 PR 상태를 적는다.
// - 이후 동기화는 meta.github_pr만 고친다. 병합·닫힘이 돼도 할 일 상태는 바꾸지 않는다 — 완료는
//   운영자가 화면의 완료 버튼으로 한다(자동 완료 금지).
// - 이미 병합·닫힌 PR은 새로 가져오지 않는다. 프로젝트 meta.github_imports에 저장소별로 가져온
//   정확히 회수한 PR 번호를 남겨, 운영자가 지운 할 일이 다음 동기화에서 되살아나지 않게 한다.
// - Moonlight는 GitHub에 쓰지 않는다. 여기 있는 IO는 GitHub 읽기와 Moonlight 기록뿐이다.

import { createHash } from "node:crypto";
import { normalizePmsCommand } from "./pms-command.ts";

type Row = Record<string, any>;

export type PullRequest = {
  number: number;
  title?: string | null;
  state?: string | null;
  draft?: boolean | null;
  html_url?: string | null;
  updated_at?: string | null;
  merged_at?: string | null;
  closed_at?: string | null;
};

export type PullRequestState = "open" | "merged" | "closed";

export type GitHubPullRequestMeta = {
  key: string;
  repo: string;
  number: number;
  url: string | null;
  title: string;
  state: PullRequestState;
  draft: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  syncedAt: string;
};

export type RepoTarget = { repo: string; key: string; projectId: string; source: "project" | "product" };
export type SkippedRepo = { repo: string; reason: "several-projects" | "no-open-project" };

const CLOSED_PROJECT_STATUSES = new Set(["completed", "archived"]);

export function repoKey(repo: string) {
  return repo.trim().toLowerCase();
}

export function prKey(repo: string, number: number) {
  return `${repoKey(repo)}#${number}`;
}

function pullRequestTaskId(workspaceId: string, repo: string, number: number) {
  // This persisted identity must stay stable across retries and deployments.
  // Match the existing workspace + PR-key lookup (not project assignment).
  // The tasks.id primary key arbitrates simultaneous inserts in any process;
  // plain INSERT still rejects conflicts without overwriting operator edits.
  const hash = createHash("sha256")
    .update(JSON.stringify(["moonlight:github-pr-task:v1", workspaceId.trim().toLowerCase(), prKey(repo, number)]))
    .digest("hex");
  const variant = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function projectGitHubRepo(project: Row) {
  const repo = project?.meta?.github?.repo;
  return typeof repo === "string" && repo.includes("/") ? repo.trim() : null;
}

// 프로젝트·제품 저장소 행 → PR을 받을 프로젝트. 직접 연결이 제품 연결보다 앞선다.
export function resolveProjectRepoTargets(projects: Row[] = [], productRepositories: Row[] = []) {
  const open = projects.filter((project) => project?.id && !CLOSED_PROJECT_STATUSES.has(String(project.status)));
  const linked = new Map<string, { repo: string; projectIds: string[] }>();
  for (const project of open) {
    const repo = projectGitHubRepo(project);
    if (!repo) continue;
    const entry = linked.get(repoKey(repo)) || { repo, projectIds: [] };
    entry.projectIds.push(String(project.id));
    linked.set(repoKey(repo), entry);
  }

  const targets: RepoTarget[] = [];
  const skipped: SkippedRepo[] = [];
  for (const [key, entry] of linked) {
    if (entry.projectIds.length === 1) targets.push({ repo: entry.repo, key, projectId: entry.projectIds[0], source: "project" });
    else skipped.push({ repo: entry.repo, reason: "several-projects" });
  }

  const seen = new Set(linked.keys());
  for (const row of productRepositories) {
    if (!row?.full_name || !row?.product_id || row.status === "disabled") continue;
    const repo = String(row.full_name);
    const key = repoKey(repo);
    if (seen.has(key)) continue;
    seen.add(key);
    const candidates = open.filter((project) => project.product_id && String(project.product_id) === String(row.product_id));
    if (candidates.length === 1) targets.push({ repo, key, projectId: String(candidates[0].id), source: "product" });
    else skipped.push({ repo, reason: candidates.length ? "several-projects" : "no-open-project" });
  }

  return { targets, skipped };
}

export function pullRequestState(pull: PullRequest): PullRequestState {
  if (pull.merged_at) return "merged";
  return pull.state === "closed" ? "closed" : "open";
}

export function pullRequestMeta(repo: string, pull: PullRequest, now: string): GitHubPullRequestMeta {
  return {
    key: prKey(repo, pull.number),
    repo,
    number: pull.number,
    url: typeof pull.html_url === "string" ? pull.html_url : null,
    title: String(pull.title || "").trim().slice(0, 300),
    state: pullRequestState(pull),
    draft: Boolean(pull.draft),
    mergedAt: pull.merged_at || null,
    closedAt: pull.closed_at || null,
    updatedAt: pull.updated_at || null,
    syncedAt: now,
  };
}

const COMPARED_FIELDS: Array<keyof GitHubPullRequestMeta> = ["url", "title", "state", "draft", "mergedAt", "closedAt"];

function metaChanged(previous: Row | null | undefined, next: GitHubPullRequestMeta) {
  if (!previous || typeof previous !== "object") return true;
  return COMPARED_FIELDS.some((field) => (previous[field] ?? null) !== (next[field] ?? null));
}

export type PlannedCreate = { number: number; title: string; status: "todo" | "doing"; githubPr: GitHubPullRequestMeta };
export type PlannedUpdate = { id: string; number: number; updatedAt: string | null; meta: Row };

// 한 저장소의 PR 목록 + 이미 있는 PR 할 일 → 만들 것·고칠 것. 할 일 상태는 계획하지 않는다.
export function planPullRequestTasks({
  target,
  pulls = [],
  existingTasks = [],
  importedNumbers = [],
  now,
}: {
  target: RepoTarget;
  pulls?: PullRequest[];
  existingTasks?: Row[];
  importedNumbers?: number[];
  now: string;
}) {
  const imported = new Set(importedNumbers);
  const seen = new Set<number>();
  const existingByKey = new Map<string, Row>();
  for (const task of existingTasks) {
    const key = task?.meta?.github_pr?.key;
    if (typeof key === "string" && !existingByKey.has(key)) existingByKey.set(key, task);
  }

  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];
  const known: number[] = [];
  for (const pull of pulls) {
    if (!Number.isSafeInteger(pull?.number) || pull.number <= 0 || seen.has(pull.number)) continue;
    seen.add(pull.number);
    const githubPr = pullRequestMeta(target.repo, pull, now);
    const task = existingByKey.get(githubPr.key);
    if (task) {
      known.push(pull.number);
      if (metaChanged(task.meta?.github_pr, githubPr)) {
        updates.push({
          id: String(task.id),
          number: pull.number,
          updatedAt: typeof task.updated_at === "string" ? task.updated_at : null,
          meta: { ...(task.meta || {}), github_pr: githubPr },
        });
      }
      continue;
    }
    if (githubPr.state !== "open") continue;
    if (imported.has(pull.number)) continue;
    creates.push({
      number: pull.number,
      title: githubPr.title || `PR #${pull.number}`,
      status: githubPr.draft ? "todo" : "doing",
      githubPr,
    });
  }
  return { creates, updates, known };
}

// Persist exact successful imports, never infer that every smaller PR was seen.
export function nextImportedNumbers(previous: number[], numbers: number[]) {
  return [...new Set([...previous, ...numbers])].sort((a, b) => a - b);
}

export type ProjectTaskSyncDeps = {
  fetchRows: (table: string, options: Row) => Promise<Row[] | null>;
  fetchPulls: (repo: string) => Promise<{ ok: boolean; status: number | null; data: PullRequest[] | null; error?: string }>;
  insert: (table: string, record: Row) => Promise<{ persisted: boolean; reason?: string }>;
  update: (table: string, filters: Array<[string, string]>, patch: Row) => Promise<{ persisted: boolean; reason?: string }>;
  quotedIn: (values: string[]) => string;
};

export type RepoTaskResult = {
  repo: string;
  projectId: string;
  source: RepoTarget["source"];
  status: "synced" | "partial" | "error";
  created: number;
  updated: number;
  failed: number;
  error?: string;
};

export async function syncProjectPullRequestTasks({
  workspaceId,
  now,
  productRepositories = [],
  deps,
}: {
  workspaceId: string;
  now: string;
  productRepositories?: Row[];
  deps: ProjectTaskSyncDeps;
}) {
  const workspaceFilter: [string, string] = ["workspace_id", `eq.${workspaceId}`];
  // select는 *다 — product_id(0049)를 이름으로 고르면 그 마이그레이션이 없는 DB에서 읽기가 통째로
  // 실패해 직접 연결한 저장소까지 멈춘다. 없으면 제품 경로만 비고 직접 연결은 그대로 돈다.
  const projects = await deps.fetchRows("projects", {
    select: "*",
    filters: [workspaceFilter, ["status", "not.in.(completed,archived)"]],
    limit: 500,
  });
  if (projects === null) return { status: "error" as const, error: "project-read-failed", repositories: [], skipped: [] };

  const { targets, skipped } = resolveProjectRepoTargets(projects, productRepositories);
  const projectById = new Map(projects.map((project) => [String(project.id), project]));
  const projectsNeedingRefresh = new Set<string>();
  const repositories: RepoTaskResult[] = [];

  for (const target of targets) {
    const base = { repo: target.repo, projectId: target.projectId, source: target.source, created: 0, updated: 0, failed: 0 };
    if (projectsNeedingRefresh.has(target.projectId)) {
      // Several repositories may share one project. A prior receipt can advance
      // its revision even when the write response was lost; never reuse that
      // snapshot for the next repository's tasks or metadata merge.
      const refreshed = await deps.fetchRows("projects", {
        select: "*",
        filters: [workspaceFilter, ["id", `eq.${target.projectId}`]],
        limit: 2,
      });
      if (!refreshed || refreshed.length !== 1 || String(refreshed[0]?.id) !== target.projectId
        || typeof refreshed[0]?.updated_at !== "string" || !refreshed[0].updated_at) {
        repositories.push({ ...base, status: "error", error: "project-refresh-failed" });
        continue;
      }
      projectById.set(target.projectId, refreshed[0]);
      projectsNeedingRefresh.delete(target.projectId);
    }
    const pulls = await deps.fetchPulls(target.repo);
    if (!pulls.ok || !pulls.data) {
      repositories.push({ ...base, status: "error", error: `${pulls.status ?? "network"} · ${pulls.error || "pull-read-failed"}`.slice(0, 300) });
      continue;
    }
    const project = projectById.get(target.projectId) || {};
    const imports = project.meta?.github_imports && typeof project.meta.github_imports === "object" ? project.meta.github_imports : {};
    const history = imports[target.key];
    // A legacy max-number cannot distinguish a never-seen PR from a deliberately
    // deleted task. Do not silently skip holes or resurrect deleted tasks.
    if (history !== undefined && (!history || history.version !== 2 || !Array.isArray(history.numbers)
      || history.numbers.some((n: unknown) => !Number.isSafeInteger(n) || Number(n) <= 0))) {
      repositories.push({ ...base, status: "error", error: "legacy-import-history-needs-review" });
      continue;
    }
    if (!project.updated_at) {
      repositories.push({ ...base, status: "error", error: "project-version-required" });
      continue;
    }
    const importedNumbers: number[] = history?.numbers || [];
    const keys = [...new Set(pulls.data.filter(pull => Number.isSafeInteger(pull?.number)).map(pull => prKey(target.repo, pull.number)))];
    const existingTasks: Row[] = [];
    let taskReadFailed = false;
    // Bounded REST filters avoid URL/row caps after enabling all PR pages.
    for (let offset = 0; offset < keys.length; offset += 50) {
      const chunk = keys.slice(offset, offset + 50);
      const rows = await deps.fetchRows("tasks", {
        select: "id,project_id,status,meta,updated_at",
        filters: [workspaceFilter, ["meta->github_pr->>key", deps.quotedIn(chunk)]],
        limit: chunk.length + 10,
      });
      if (rows === null || rows.length >= chunk.length + 10) { taskReadFailed = true; break; }
      existingTasks.push(...rows);
    }
    if (taskReadFailed) {
      repositories.push({ ...base, status: "error", error: "task-read-failed-or-truncated" });
      continue;
    }
    const plan = planPullRequestTasks({ target, pulls: pulls.data, existingTasks, importedNumbers, now });

    const createdNumbers: number[] = [];
    let failed = 0;
    for (const create of plan.creates) {
      const command = normalizePmsCommand({
        action: "create_task",
        id: pullRequestTaskId(workspaceId, target.repo, create.number),
        projectId: target.projectId,
        title: create.title,
        status: create.status,
        source: "github",
      }, { workspaceId, now });
      if (!command.ok || !command.record) { failed += 1; continue; }
      const record = { ...command.record, meta: { ...(command.record.meta as Row), github_pr: create.githubPr } };
      const write = await deps.insert("tasks", record);
      if (write.persisted) createdNumbers.push(create.number);
      else failed += 1;
    }

    // 읽은 버전에 대해서만 meta를 쓴다 — 그 사이 운영자가 체크리스트 등을 고쳤으면 덮지 않고
    // 다음 동기화가 새 meta 위에 다시 적는다(no-matching-row는 실패로 세지 않는다).
    let updated = 0;
    for (const update of plan.updates) {
      const filters: Array<[string, string]> = [["id", `eq.${update.id}`], workspaceFilter];
      if (update.updatedAt) filters.push(["updated_at", `eq.${update.updatedAt}`]);
      const write = await deps.update("tasks", filters, { meta: update.meta });
      if (write.persisted) updated += 1;
      else if (write.reason !== "no-matching-row") failed += 1;
    }

    const numbers = nextImportedNumbers(importedNumbers, [...plan.known, ...createdNumbers]);
    let receiptError: string | undefined;
    if (history === undefined || JSON.stringify(numbers) !== JSON.stringify(importedNumbers)) {
      // Keep successful receipts even when another create failed; only the
      // unsuccessful PR retries. Preserve unrelated project metadata by revision.
      projectsNeedingRefresh.add(target.projectId);
      const receipt = await deps.update("projects", [["id", `eq.${target.projectId}`], workspaceFilter, ["updated_at", `eq.${project.updated_at}`]], {
        meta: { ...(project.meta || {}), github_imports: { ...imports, [target.key]: { version: 2, numbers } } },
      });
      if (!receipt.persisted) { failed += 1; receiptError = "import-receipt-write-failed"; }
    }

    repositories.push({
      ...base,
      status: failed ? (createdNumbers.length || updated ? "partial" : "error") : "synced",
      created: createdNumbers.length,
      updated,
      failed,
      ...(receiptError ? { error: receiptError } : {}),
    });
  }

  const errors = repositories.filter((repo) => repo.status !== "synced").length;
  return {
    status: errors ? (errors === repositories.length ? "error" as const : "partial" as const) : "synced" as const,
    repositories,
    skipped,
  };
}
