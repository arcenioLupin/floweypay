import { redirect } from "next/navigation";
import { requireUserId } from "@/app/api/_lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireUserId();
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
