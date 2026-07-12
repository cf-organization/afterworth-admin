import { AppShell } from "@/components/shell/AppShell";

// Route group: wraps the three gated surfaces in the admin shell. /login and /forbidden are outside it.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
