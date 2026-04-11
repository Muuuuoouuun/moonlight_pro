import { redirect } from "next/navigation";
import { appendQueryParam, resolveContentBrand } from "@/lib/dashboard-contexts";

export default function CardNewsPage({ searchParams }) {
  const brand = resolveContentBrand(searchParams?.brand);
  redirect(appendQueryParam("/dashboard/content/studio", "brand", brand.value === "all" ? "" : brand.value));
}
