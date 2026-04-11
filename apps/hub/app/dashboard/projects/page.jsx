import { redirect } from "next/navigation";
import { appendQueryParam, resolveWorkContext } from "@/lib/dashboard-contexts";

export default function ProjectsPage({ searchParams }) {
  const project = resolveWorkContext(searchParams?.project);
  redirect(appendQueryParam("/dashboard/work/projects", "project", project.value === "all" ? "" : project.value));
}
