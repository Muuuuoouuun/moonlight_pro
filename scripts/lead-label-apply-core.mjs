// apply-lead-labels.mjs의 순수 병합 로직 — 테스트 가능하게 CLI/IO에서 분리.
// 계약 (spec §3.1): 결측 필드에만 쓰고, label_source가 operator인 필드와 이미 값이
// 있는 필드는 절대 덮지 않는다. 반환 patch는 "전체 meta" (read-merge-write, 무클로버).

export function buildLabelApplyPatch(existingMeta, proposal = {}) {
  const meta = existingMeta && typeof existingMeta === "object" ? existingMeta : {};
  const source = meta.label_source && typeof meta.label_source === "object" ? { ...meta.label_source } : {};
  const fields = {};
  const skipped = [];

  const wantSubjects = Array.isArray(proposal.proposedSubjects) && proposal.proposedSubjects.length > 0;
  const subjectsLocked = source.subjects === "operator" || (Array.isArray(meta.subjects) && meta.subjects.length > 0);
  if (wantSubjects && !subjectsLocked) {
    fields.subjects = proposal.proposedSubjects;
    source.subjects = proposal.subjectsSource || "derived";
  } else if (wantSubjects) {
    skipped.push("subjects");
  }

  const wantRegion = Boolean(String(proposal.proposedRegion || "").trim());
  const regionLocked = source.region === "operator" || Boolean(String(meta.region || "").trim());
  if (wantRegion && !regionLocked) {
    fields.region = String(proposal.proposedRegion).trim();
    source.region = proposal.regionSource || "searched";
  } else if (wantRegion) {
    skipped.push("region");
  }

  if (!("subjects" in fields) && !("region" in fields)) return { patch: null, skipped };
  return { patch: { ...meta, ...fields, label_source: source }, skipped };
}
