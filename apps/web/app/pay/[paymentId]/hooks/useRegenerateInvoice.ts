"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type StartInvoiceResp =
  | { success: true; data: { paymentId: string; reused?: boolean } }
  | { success: false; message: string };

export function useRegenerateInvoice(paymentLinkToken?: string) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async () => {
    if (!paymentLinkToken) {
      setError("MISSING_PAYMENT_LINK_TOKEN");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/payment-links/${paymentLinkToken}/start`, {
        method: "POST",
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as StartInvoiceResp | null;

      if (!res.ok || !json) throw new Error("REQUEST_FAILED");
      if (!json.success) throw new Error(json.message ?? "BAD_REQUEST");

      // ✅ Mejor UX: no dejamos “volver atrás” a un invoice expirado
      router.replace(`/pay/${json.data.paymentId}`);

      // (Opcional) Útil si sientes que el árbol no refresca en algunos casos
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [paymentLinkToken, router]);

  return { regenerate, loading, error };
}
