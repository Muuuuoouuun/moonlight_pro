import type { PullRequest } from "./github-project-tasks.ts";

type PageResult = { ok: boolean; status: number | null; data: PullRequest[] | null; error?: string };
type FetchPage = (path: string) => Promise<PageResult>;
export const PR_PAGE_SIZE = 50;

// No partial page set is presented as a complete import. A changing list may
// shift between pages; exact import receipts let the next run recover any gap.
export async function fetchPullRequestPages(repo: string, fetchPage: FetchPage, maxPages = 100): Promise<PageResult> {
  const rows = new Map<number, PullRequest>();
  for (const state of ["open", "closed"]) {
    let complete = false;
    for (let page = 1; page <= maxPages; page++) {
      const path = `/repos/${repo}/pulls?state=${state}&sort=created&direction=asc&per_page=${PR_PAGE_SIZE}&page=${page}`;
      let result: PageResult;
      try { result = await fetchPage(path); }
      catch { return { ok: false, status: null, data: null, error: "pull-page-read-failed" }; }
      if (!result.ok) return { ...result, data: null };
      if (!Array.isArray(result.data) || result.data.length > PR_PAGE_SIZE
        || result.data.some(row => !Number.isSafeInteger(row?.number) || row.number <= 0)) {
        return { ok: false, status: result.status, data: null, error: "invalid-pull-page" };
      }
      // A PR that closes during traversal is represented by its newer closed row.
      for (const row of result.data) rows.set(row.number, row);
      if (result.data.length < PR_PAGE_SIZE) { complete = true; break; }
    }
    if (!complete) return { ok: false, status: null, data: null, error: "pull-page-limit" };
  }
  return { ok: true, status: 200, data: [...rows.values()] };
}
