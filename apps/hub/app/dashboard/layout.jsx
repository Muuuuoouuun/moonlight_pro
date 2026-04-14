import { DashboardShell } from "@/components/shell/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }) {
  return <DashboardShell>{children}</DashboardShell>;
}
