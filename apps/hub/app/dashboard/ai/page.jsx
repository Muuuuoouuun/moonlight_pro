import { redirect } from "next/navigation";

/**
 * AI 섹션 루트는 `/dashboard/ai/office`(상황실)로 직결한다.
 * 운영자는 진입과 동시에 에이전트·오더·활동이 한 눈에 보이는 운영 보드에서 시작한다.
 */
export default function AiSectionPage() {
  redirect("/dashboard/ai/office");
}
