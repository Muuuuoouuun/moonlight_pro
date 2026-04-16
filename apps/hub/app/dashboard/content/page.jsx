import { redirect } from "next/navigation";

/**
 * Content 섹션 루트는 `/dashboard/content/queue`로 직결한다.
 * 브랜드 레퍼런스는 큐와 스튜디오 안에서 inline으로만 보이도록 유지한다.
 */
export default function ContentSectionPage() {
  redirect("/dashboard/content/queue");
}
