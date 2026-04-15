import { redirect } from "next/navigation";
import { appendQueryParam, resolveContentBrand } from "@/lib/dashboard-contexts";

export default async function CardNewsPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const brand = resolveContentBrand(params?.brand);
  redirect(appendQueryParam("/dashboard/content/studio", "brand", brand.value === "all" ? "" : brand.value));
}
