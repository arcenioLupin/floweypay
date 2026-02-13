"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiResp, PaymentLinkVM } from "@/app/types/paymentTypes";
import { invoiceToPaymentLinkVM } from "@/app/helpers/btcPaymentLinkHelpers";

type State = {
  vm: PaymentLinkVM | null;
  loading: boolean;
  error: string | null;
};

export function usePaymentLinkVm(paymentId: string) {
  const [state, setState] = useState<State>({
    vm: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!paymentId) {
      setState({ vm: null, loading: false, error: "MISSING_PAYMENT_ID" });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    const controller = new AbortController();

    try {
      const res = await fetch(`/api/public/payments/${paymentId}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("BAD_RESPONSE");
      }

      const json = (await res.json().catch(() => null)) as ApiResp | null;

      if (!res.ok || !json) throw new Error("REQUEST_FAILED");
      if (!json.success) throw new Error(json.message ?? "BAD_REQUEST");

      const vm = invoiceToPaymentLinkVM(json.data);
      setState({ vm, loading: false, error: null });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;

      const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
      setState({ vm: null, loading: false, error: msg });
    }

    return () => controller.abort();
  }, [paymentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
