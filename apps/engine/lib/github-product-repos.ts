// 제품 카드에 적힌 GitHub 저장소를 동기화 대상 목록으로 만든다 (제품 개발 기획 §5, 0단계).
// Hub가 요청 본문으로 넘긴 목록과 환경 변수(GITHUB_REPOSITORIES)를 합친다. 부수효과가 없어
// node --test로 직접 검증한다 — github-sync.ts는 Supabase 클라이언트를 불러서 여기로 분리했다.

export type ProductRepositoryInput = { fullName: string; productId: string };
export type GitHubRepoConfig = { fullName: string; projectId: string | null; productId: string | null };

export const MAX_PRODUCT_REPOSITORIES = 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/;

export function normalizeRepo(value: string) {
  return value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
}

// 저장소는 제품 하나에만 속한다 — 같은 저장소가 두 번 오면 먼저 온 제품을 쓴다.
export function parseProductRepositories(value: unknown): ProductRepositoryInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const repos: ProductRepositoryInput[] = [];
  for (const entry of value.slice(0, MAX_PRODUCT_REPOSITORIES)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const fullName = normalizeRepo(String(row.fullName || ""));
    const productId = String(row.productId || "");
    if (!REPO_PATTERN.test(fullName) || !UUID_PATTERN.test(productId)) continue;
    const key = fullName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push({ fullName, productId });
  }
  return repos;
}

export function mergeRepositoryConfigs(
  envValue: string,
  projectMap: Map<string, string>,
  productRepositories: ProductRepositoryInput[] = [],
): GitHubRepoConfig[] {
  const envRepos = Array.from(new Set(
    envValue.split(",").map(normalizeRepo).filter((repo) => REPO_PATTERN.test(repo)),
  ));
  const productByRepo = new Map(productRepositories.map((repo) => [repo.fullName.toLowerCase(), repo.productId]));
  const envKeys = new Set(envRepos.map((repo) => repo.toLowerCase()));
  return [
    ...envRepos.map((fullName) => ({
      fullName,
      projectId: projectMap.get(fullName.toLowerCase()) || null,
      productId: productByRepo.get(fullName.toLowerCase()) || null,
    })),
    ...productRepositories
      .filter((repo) => !envKeys.has(repo.fullName.toLowerCase()))
      .map((repo) => ({
        fullName: repo.fullName,
        projectId: projectMap.get(repo.fullName.toLowerCase()) || null,
        productId: repo.productId,
      })),
  ];
}
