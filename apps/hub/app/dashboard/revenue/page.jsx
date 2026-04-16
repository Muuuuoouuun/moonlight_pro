import { redirect } from "next/navigation";

/**
 * Revenue 섹션 루트는 `/dashboard/revenue/leads`로 직결한다.
 * 요약·설명 카드는 Dashboard 외 섹션에선 더 이상 반복하지 않는다.
 */
export default function RevenueSectionPage() {
  redirect("/dashboard/revenue/leads");
}
