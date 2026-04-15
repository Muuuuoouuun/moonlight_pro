import { redirect } from "next/navigation";
import { appendQueryParam, resolveWorkContext } from "@/lib/dashboard-contexts";

export default async function ProjectsPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const project = resolveWorkContext(params?.project);
  redirect(appendQueryParam("/dashboard/work/projects", "project", project.value === "all" ? "" : project.value));
}
