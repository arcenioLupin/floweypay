import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { requireUserId } from "@/app/api/_lib/auth";
import { NavShell } from "./components/NavShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();
  try {
    await requireUserId();
  } catch {
    redirect("/login");
  }

  return <NavShell>{children}</NavShell>;
}
