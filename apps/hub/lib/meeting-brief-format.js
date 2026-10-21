// Browser-safe formatting: never import provider credentials into this module.
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function formatMeetingBriefForShare(data) {
  if (!isObject(data)) return "";
  const lines = [];
  if (data.title) lines.push(`📌 [회의/메모] ${data.title}`);
  if (data.summary) lines.push(`\n■ 핵심 요약\n${data.summary}`);
  if (data.keyDecisions?.length) lines.push(`\n■ 합의 및 결정사항\n${data.keyDecisions.map((d) => `• ${d}`).join("\n")}`);
  if (data.openIssues?.length) lines.push(`\n■ 미결/후속 논의 안건\n${data.openIssues.map((i) => `• ${i}`).join("\n")}`);
  if (data.actionItems?.length) {
    lines.push(`\n■ 후속 실행 과제 (Action Items)\n${data.actionItems.map((a) => `□ ${a.task}${a.suggestedDue ? ` (기한: ${a.suggestedDue})` : ""}`).join("\n")}`);
  }
  if (data.detectedEntities?.peopleOrCompanies?.length) {
    lines.push(`\n■ 관련자: ${data.detectedEntities.peopleOrCompanies.join(", ")}`);
  }
  return lines.join("\n").trim();
}
