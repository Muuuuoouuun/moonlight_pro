// 할 일 meta.github_pr(Engine github-project-tasks.ts가 적는다) → 화면용 값.
// 제품 렌즈 §5.3 · 2026-10-18 운영자 결정: PR이 병합·닫혀도 할 일을 자동 완료하지 않고
// "GitHub에서 병합됨" 표시와 완료 버튼만 둔다. Moonlight는 GitHub에 쓰지 않는다.

const GITHUB_PR_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/;
const PR_STATES = new Set(["open", "merged", "closed"]);

export function readTaskGitHubPr(row) {
  const pr = row?.meta?.github_pr;
  if (!pr || typeof pr !== "object" || !Number.isInteger(pr.number) || pr.number <= 0) return null;
  const state = PR_STATES.has(pr.state) ? pr.state : "open";
  return {
    repo: typeof pr.repo === "string" ? pr.repo : "",
    number: pr.number,
    // 저장된 값이라도 GitHub PR 주소 모양일 때만 링크로 연다.
    url: typeof pr.url === "string" && GITHUB_PR_URL.test(pr.url) ? pr.url : null,
    state,
    draft: state === "open" && pr.draft === true,
  };
}

// 상태 문구는 §5.3 lifecycle 문법을 따른다 — 병합은 check(done), 닫힘은 slash(cancelled), 색 없음.
export function githubPrStatus(pr, done = false) {
  if (!pr) return null;
  if (pr.state === "merged") return { label: "GitHub에서 병합됨", lifecycle: "done", offerComplete: !done };
  if (pr.state === "closed") return { label: "GitHub에서 닫힘", lifecycle: "cancelled", offerComplete: !done };
  return { label: pr.draft ? "PR 초안" : "PR 열림", lifecycle: null, offerComplete: false };
}
