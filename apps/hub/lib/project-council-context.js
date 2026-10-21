// Projects must opt into an exact-record boundary. The Council's frozen model
// contract is personal-brand only; a company project cannot fall back to it.
export function projectCouncilIssue({ ref, scope } = {}) {
  if (scope === "classin") return "Council은 개인 프로젝트 자문만 지원합니다. ClassIn 업무는 오피스나 세일즈 Guru에서 검토해 주세요.";
  if (scope !== "personal") return "프로젝트의 회사·개인 범위를 확인할 수 없습니다. 프로젝트를 다시 선택해 주세요.";
  if (typeof ref !== "string" || !ref.trim()) return "선택한 프로젝트 ID를 확인할 수 없습니다. 프로젝트를 다시 선택해 주세요.";
  return null;
}

// The mapped ledger normally supplies both fields. Accept either explicit form,
// but never infer personal from a missing/unknown value or conflicting fields.
export function projectCouncilScope(project) {
  const scope = project?.orgScope;
  const workspace = project?.workspace;
  if (scope != null && !["personal", "classin"].includes(scope)) return null;
  if (workspace != null && !["brand", "classin"].includes(workspace)) return null;
  const workspaceScope = workspace === "brand" ? "personal" : workspace === "classin" ? "classin" : null;
  if (scope && workspaceScope && scope !== workspaceScope) return null;
  return scope || workspaceScope;
}
