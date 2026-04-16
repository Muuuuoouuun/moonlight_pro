import { redirect } from "next/navigation";

/**
 * Evolution 섹션 루트는 `/dashboard/evolution/logs`로 직결한다.
 * 자가개선 루프 설명은 Dashboard 외엔 반복하지 않는다.
 */
export default function EvolutionSectionPage() {
  redirect("/dashboard/evolution/logs");
}
