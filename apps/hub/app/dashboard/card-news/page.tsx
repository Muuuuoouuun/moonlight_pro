import { redirect } from "next/navigation"

// 기존 경로 유지 → /dashboard/content/new 로 이전
export default function CardNewsRedirect() {
  redirect("/dashboard/content/new")
}
