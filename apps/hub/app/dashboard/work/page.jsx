import { redirect } from "next/navigation";

/**
 * Work 섹션 루트는 `/dashboard/work/projects`로 직결한다.
 * 기존 요약면은 `docs/hub-minimal-practical-redesign-plan.md`의
 * "섹션 루트는 즉시 작업형" 원칙에 따라 제거했다.
 */
export default function WorkSectionPage() {
  redirect("/dashboard/work/projects");
}
