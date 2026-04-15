import { redirect } from "next/navigation";
import { appendQueryParam, resolveWorkContext } from "@/lib/dashboard-contexts";

export default async function PmsPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const project = resolveWorkContext(params?.project);
  redirect(appendQueryParam("/dashboard/work/pms", "project", project.value === "all" ? "" : project.value));
}
