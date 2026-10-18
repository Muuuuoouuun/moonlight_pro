// GitHub PR → 프로젝트 할 일 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §5.3,
// 2026-10-18 운영자 결정: PR 기준 · 표시 + 완료 버튼).
//
// - 대상 저장소: 프로젝트 meta.github.repo로 직접 연결한 저장소, 그리고 제품 탭에 연결한 저장소
//   (그 제품의 열린 프로젝트가 하나일 때). 한 저장소에 프로젝트가 여럿이면 추측하지 않고 건너뛴다.
// - 열린 PR → 할 일 하나(draft는 todo, 그 외 doing). 할 일 meta.github_pr에 PR 상태를 적는다.
// - 이후 동기화는 meta.github_pr만 고친다. 병합·닫힘이 돼도 할 일 상태는 바꾸지 않는다 — 완료는
//   운영자가 화면의 완료 버튼으로 한다(자동 완료 금지).
// - 이미 병합·닫힌 PR은 새로 가져오지 않는다. 프로젝트 meta.github_imports에 저장소별로 가져온
//   PR 번호의 기준선을 남겨, 운영자가 지운 할 일이 다음 동기화에서 되살아나지 않게 한다.
// - Moonlight는 GitHub에 쓰지 않는다. 여기 있는 IO는 GitHub 읽기와 Moonlight 기록뿐이다.

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
  importedThrough = null,
  now,
}: {
  target: RepoTarget;
  pulls?: PullRequest[];
  existingTasks?: Row[];
  importedThrough?: number | null;
  now: string;
}) {
  const existingByKey = new Map<string, Row>();
  for (const task of existingTasks) {
    const key = task?.meta?.github_pr?.key;
    if (typeof key === "string" && !existingByKey.has(key)) existingByKey.set(key, task);
  }

  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];
  const known: number[] = [];
  for (const pull of pulls) {
    if (!Number.isInteger(pull?.number) || pull.number <= 0) continue;
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
    if (importedThrough !== null && pull.number <= importedThrough) continue;
    creates.push({
      number: pull.number,
      title: githubPr.title || `PR #${pull.number}`,
      status: githubPr.draft ? "todo" : "doing",
      githubPr,
    });
  }
  return { creates, updates, known };
}

// 기준선은 이번에 확인한(있던 것 + 새로 만든) PR 번호 중 가장 큰 값으로만 올린다. 만들기에 실패한
// PR이 있으면 다음 동기화에서 다시 시도하도록 기준선을 올리지 않는다.
export function nextImportedThrough(previous: number | null, numbers: number[], failed: boolean) {
  if (failed) return previous;
  const max = numbers.length ? Math.max(...numbers) : null;
  if (max === null) return previous;
  return previous === null ? max : Math.max(previous, max);
}

export type ProjectTaskSyncDeps = {
  fetchRows: (table: string, options: Row) => Promise<Row[] | null>;
  fetchPulls: (repo: string) => Promise<{ ok: boolean; status: number | null; data: PullRequest[] | null; error?: string }>;
  insert: (table: string, record: Row) => Promise<{ persisted: boolean; reason?: string }>;
  update: (table: string, filters: Array<[string, string]>, patch: Row) => Promise<{ persisted: boolean; reason?: string }>;
  newId: () => string;
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
  const repositories: RepoTaskResult[] = [];

  for (const target of targets) {
    const base = { repo: target.repo, projectId: target.projectId, source: target.source, created: 0, updated: 0, failed: 0 };
    const pulls = await deps.fetchPulls(target.repo);
    if (!pulls.ok || !pulls.data) {
      repositories.push({ ...base, status: "error", error: `${pulls.status ?? "network"} · ${pulls.error || "pull-read-failed"}`.slice(0, 300) });
      continue;
    }
    const keys = pulls.data.filter((pull) => Number.isInteger(pull?.number)).map((pull) => prKey(target.repo, pull.number));
    const existingTasks = keys.length
      ? await deps.fetchRows("tasks", {
        select: "id,project_id,status,meta,updated_at",
        filters: [workspaceFilter, ["meta->github_pr->>key", deps.quotedIn(keys)]],
        limit: keys.length + 10,
      })
      : [];
    if (existingTasks === null) {
      repositories.push({ ...base, status: "error", error: "task-read-failed" });
      continue;
    }

    const project = projectById.get(target.projectId) || {};
    const imports = project.meta?.github_imports && typeof project.meta.github_imports === "object" ? project.meta.github_imports : {};
    const importedThrough = Number.isInteger(imports[target.key]) ? imports[target.key] as number : null;
    const plan = planPullRequestTasks({ target, pulls: pulls.data, existingTasks, importedThrough, now });

    const createdNumbers: number[] = [];
    let failed = 0;
    for (const create of plan.creates) {
      const command = normalizePmsCommand({
        action: "create_task",
        id: deps.newId(),
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

    const watermark = nextImportedThrough(importedThrough, [...plan.known, ...createdNumbers], failed > 0);
    if (watermark !== null && watermark !== importedThrough && project.updated_at) {
      // 다른 meta 키를 덮지 않도록 읽은 버전에 대해서만 쓴다. 충돌하면 다음 동기화가 다시 올린다.
      await deps.update("projects", [["id", `eq.${target.projectId}`], workspaceFilter, ["updated_at", `eq.${project.updated_at}`]], {
        meta: { ...(project.meta || {}), github_imports: { ...imports, [target.key]: watermark } },
      });
    }

    repositories.push({
      ...base,
      status: failed ? (createdNumbers.length || updated ? "partial" : "error") : "synced",
      created: createdNumbers.length,
      updated,
      failed,
    });
  }

  const errors = repositories.filter((repo) => repo.status !== "synced").length;
  return {
    status: errors ? (errors === repositories.length ? "error" as const : "partial" as const) : "synced" as const,
    repositories,
    skipped,
  };
}
