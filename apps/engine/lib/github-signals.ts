// GitHub 개발 신호의 순수 규칙 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §5.2).
// 폴링(github-sync.ts)과 webhook(github-webhook.ts)이 같은 규칙으로 저장소 요약과 기록 행을 만든다.
// Moonlight는 GitHub에 쓰지 않는다 — 여기 있는 것은 전부 읽은 값을 해석하는 함수다.

import { createHmac, timingSafeEqual } from "crypto";

type Row = Record<string, unknown>;

export type CiState = "success" | "failure" | "pending" | "none";

export type RepositoryLink = {
  id?: string;
  product_id: string;
  full_name: string;
  default_branch: string;
  last_summary?: Row | null;
};

export type SignalUpdate = {
  event_type: string;
  status: "reported" | "blocked" | "done";
  title: string;
  summary: string;
  next_action: string | null;
  payload: Row;
};

export type MappedEvent =
  | { ignored: string }
  | { ignored?: undefined; summaryPatch: Row; update: SignalUpdate | null };

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function str(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// X-Hub-Signature-256: "sha256=<hex>". 비밀값이 없으면 항상 실패(닫힘)다.
export function verifyGitHubSignature(secret: string, rawBody: string, header: string | null) {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const supplied = Buffer.from(header.trim());
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

// 기본 브랜치 최신 커밋의 check run 목록 → 하나의 CI 상태. 하나라도 실패면 실패,
// 끝나지 않은 것이 있으면 진행 중, 전부 성공·건너뜀이면 성공, 없으면 none.
export function summarizeCheckRuns(checkRuns: unknown[]): { state: CiState; failed: string[]; url: string | null } {
  const runs = (Array.isArray(checkRuns) ? checkRuns : []).map(record);
  if (!runs.length) return { state: "none", failed: [], url: null };
  const failed = runs.filter((run) => run.status === "completed" && FAILED_CONCLUSIONS.has(String(run.conclusion)));
  if (failed.length) {
    return { state: "failure", failed: failed.map((run) => str(run.name, 120)).filter(Boolean), url: str(failed[0].html_url, 500) || null };
  }
  if (runs.some((run) => run.status !== "completed")) return { state: "pending", failed: [], url: null };
  return { state: "success", failed: [], url: null };
}

function ciFailureUpdate(repo: RepositoryLink, workflow: string, branch: string, url: string | null): SignalUpdate {
  return {
    event_type: "github.ci_failed",
    status: "blocked",
    title: `CI 실패 · ${repo.full_name}`,
    summary: [workflow || "CI", branch].filter(Boolean).join(" · "),
    next_action: "실패한 CI를 확인하거나 Codex에 맡기세요.",
    payload: { repository: repo.full_name, productId: repo.product_id, workflow, branch, url },
  };
}

// 폴링이 본 CI 상태 변화를 기록 행으로. 같은 상태가 이어지면 행을 만들지 않는다(소음 방지).
export function ciTransitionUpdate(repo: RepositoryLink, next: { state: CiState; failed: string[]; url: string | null }): SignalUpdate | null {
  const previous = str(record(record(repo.last_summary).ci).state, 20);
  if (next.state === "failure" && previous !== "failure") {
    return ciFailureUpdate(repo, next.failed.join(", "), repo.default_branch, next.url);
  }
  if (next.state === "success" && previous === "failure") {
    return {
      event_type: "github.ci_recovered",
      status: "done",
      title: `CI 복구 · ${repo.full_name}`,
      summary: repo.default_branch,
      next_action: null,
      payload: { repository: repo.full_name, productId: repo.product_id, branch: repo.default_branch },
    };
  }
  return null;
}

function hasBugLabel(labels: unknown) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === "string" ? label : str(record(label).name, 60)).toLowerCase())
    .some((name) => name === "bug" || name.includes("bug"));
}

// webhook 이벤트 하나 → 저장소 요약 병합분 + (필요하면) 기록 행 하나.
export function mapGitHubWebhookEvent(event: string, body: unknown, repo: RepositoryLink, now: string): MappedEvent {
  const payload = record(body);
  const action = str(payload.action, 40);
  const defaultBranch = repo.default_branch || "main";

  if (event === "ping") return { ignored: "ping" };

  if (event === "workflow_run") {
    const run = record(payload.workflow_run);
    if (action !== "completed") return { ignored: "workflow-not-completed" };
    const branch = str(run.head_branch, 200);
    if (branch !== defaultBranch) return { ignored: "non-default-branch" };
    const conclusion = str(run.conclusion, 40);
    const workflow = str(run.name, 120);
    const url = str(run.html_url, 500) || null;
    const at = str(run.updated_at, 40) || now;
    if (FAILED_CONCLUSIONS.has(conclusion)) {
      return {
        summaryPatch: { ci: { state: "failure", failed: [workflow].filter(Boolean), url, at, source: "webhook" } },
        update: ciFailureUpdate(repo, workflow, branch, url),
      };
    }
    if (conclusion === "success") {
      const previous = str(record(record(repo.last_summary).ci).state, 20);
      return {
        summaryPatch: { ci: { state: "success", failed: [], url: null, at, source: "webhook" } },
        update: previous === "failure"
          ? ciTransitionUpdate({ ...repo, last_summary: { ci: { state: "failure" } } }, { state: "success", failed: [], url: null })
          : null,
      };
    }
    return { ignored: `workflow-${conclusion || "unknown"}` };
  }

  if (event === "pull_request") {
    const pull = record(payload.pull_request);
    const number = Number(pull.number) || null;
    const title = str(pull.title, 200);
    const base = { repository: repo.full_name, productId: repo.product_id, number, url: str(pull.html_url, 500) || null };
    if (action === "opened" && !pull.draft) {
      return { summaryPatch: { lastPullRequestAt: now }, update: { event_type: "github.pr_opened", status: "reported", title: `PR 열림 · #${number} ${title}`, summary: repo.full_name, next_action: null, payload: base } };
    }
    if (action === "review_requested") {
      return { summaryPatch: { lastPullRequestAt: now }, update: { event_type: "github.pr_review_requested", status: "reported", title: `리뷰 요청 · #${number} ${title}`, summary: repo.full_name, next_action: "리뷰 요청된 PR을 확인하세요.", payload: base } };
    }
    if (action === "closed" && pull.merged === true) {
      return { summaryPatch: { lastPullRequestAt: now }, update: { event_type: "github.pr_merged", status: "done", title: `PR 병합 · #${number} ${title}`, summary: repo.full_name, next_action: null, payload: base } };
    }
    return { ignored: `pull-request-${action || "unknown"}` };
  }

  if (event === "issues") {
    const issue = record(payload.issue);
    if (!hasBugLabel(issue.labels) || (action !== "opened" && action !== "closed")) return { ignored: "issue-not-bug" };
    const number = Number(issue.number) || null;
    const title = str(issue.title, 200);
    return {
      summaryPatch: {},
      update: {
        event_type: action === "opened" ? "github.bug_opened" : "github.bug_closed",
        status: action === "opened" ? "reported" : "done",
        title: `${action === "opened" ? "버그 등록" : "버그 닫힘"} · #${number} ${title}`,
        summary: repo.full_name,
        next_action: null,
        payload: { repository: repo.full_name, productId: repo.product_id, number, url: str(issue.html_url, 500) || null },
      },
    };
  }

  if (event === "release") {
    if (action !== "published") return { ignored: `release-${action || "unknown"}` };
    const release = record(payload.release);
    const tag = str(release.tag_name, 100);
    const latestRelease = { tag, name: str(release.name, 200) || tag, url: str(release.html_url, 500) || null, at: str(release.published_at, 40) || now };
    return {
      summaryPatch: { latestRelease },
      update: { event_type: "github.release", status: "done", title: `릴리스 · ${tag}`, summary: repo.full_name, next_action: null, payload: { repository: repo.full_name, productId: repo.product_id, ...latestRelease } },
    };
  }

  if (event === "push") {
    if (str(payload.ref, 300) !== `refs/heads/${defaultBranch}`) return { ignored: "non-default-branch" };
    const head = record(payload.head_commit);
    // 모멘텀 축 입력은 시각만 쓴다 — 커밋 내용은 저장하지 않는다(§5.2).
    return { summaryPatch: { lastPushAt: str(head.timestamp, 40) || now }, update: null };
  }

  return { ignored: `unsupported-event:${event || "unknown"}` };
}
