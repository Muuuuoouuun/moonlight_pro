import { redirect } from "next/navigation";
import { appendQueryParam, resolveWorkContext } from "@/lib/dashboard-contexts";

export default function PmsPage({ searchParams }) {
  const project = resolveWorkContext(searchParams?.project);
  redirect(appendQueryParam("/dashboard/work/pms", "project", project.value === "all" ? "" : project.value));
}
