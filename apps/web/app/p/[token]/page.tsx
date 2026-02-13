import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function PublicPaymentLinkPage({ params }: Props) {
  const { token } = await params;

  const h = await headers();
  const host = h.get("host");

  const proto = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = host ? `${proto}://${host}` : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/public/payment-links/${token}/start`, {
    method: "POST",
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success || !json?.data?.paymentId) {
    redirect("/404");
  }

  redirect(`/pay/${json.data.paymentId}`);
}
