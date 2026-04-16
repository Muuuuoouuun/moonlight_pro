import { redirect } from "next/navigation";

/**
 * Automations 섹션 루트는 `/dashboard/automations/runs`로 직결한다.
 * 머신 펄스 요약은 Dashboard에서만 유지하고 섹션 루트에선 제거했다.
 */
export default function AutomationsSectionPage() {
  redirect("/dashboard/automations/runs");
}
