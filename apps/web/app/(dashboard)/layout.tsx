import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { requireUserId } from "@/app/api/_lib/auth";
import { NavShell } from "./components/NavShell";
import { I18nProvider } from "@/app/lib/i18n/useTranslations";

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

  return (
    <I18nProvider>
      <NavShell>{children}</NavShell>
    </I18nProvider>
  );
}
