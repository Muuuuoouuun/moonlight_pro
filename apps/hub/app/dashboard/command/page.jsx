import { redirect } from "next/navigation";

// Legacy alias — the Command utility now lives at /dashboard/command-center.
// Kept so bookmarks to /dashboard/command continue to resolve.
export default function CommandRedirect() {
  redirect("/dashboard/command-center");
}
