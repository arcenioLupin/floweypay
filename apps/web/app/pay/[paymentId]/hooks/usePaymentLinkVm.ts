"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiResp, PaymentLinkVM, PaymentStatus } from "@/app/types/paymentTypes";
import { invoiceToPaymentLinkVM } from "@/app/helpers/btcPaymentLinkHelpers";

type State = {
  vm: PaymentLinkVM | null;
  loading: boolean;
  error: string | null;
};

const TERMINAL_STATUSES = new Set<PaymentStatus>(["CONFIRMED", "EXPIRED", "FAILED"]);
const POLL_INTERVAL_MS = 4_000;

export function usePaymentLinkVm(paymentId: string) {
  const [state, setState] = useState<State>({
    vm: null,
    loading: true,
    error: null,
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * fetchOnce: does a single fetch.
   * - showLoading: true  → sets loading=true, clears error, reports failures to state
   * - showLoading: false → silent background poll; failures are suppressed so existing vm stays
   */
  const fetchOnce = useCallback(
    async (opts: { showLoading?: boolean } = {}) => {
      if (!paymentId) {
        setState({ vm: null, loading: false, error: "MISSING_PAYMENT_ID" });
        return;
      }

      if (opts.showLoading) {
        setState((s) => ({ ...s, loading: true, error: null }));
      }

      try {
        const res = await fetch(`/api/public/payments/${paymentId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!mountedRef.current) return;

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) throw new Error("BAD_RESPONSE");

        const json = (await res.json().catch(() => null)) as ApiResp | null;
        if (!res.ok || !json) throw new Error("REQUEST_FAILED");
        if (!json.success) throw new Error(json.message ?? "BAD_REQUEST");

        const vm = invoiceToPaymentLinkVM(json.data);
        if (mountedRef.current) setState({ vm, loading: false, error: null });
      } catch (e) {
        if (!mountedRef.current) return;
        const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
        if (opts.showLoading) {
          setState({ vm: null, loading: false, error: msg });
        }
        // Silent poll failure: keep existing vm on screen
      }
    },
    [paymentId],
  );

  // Initial load
  useEffect(() => {
    void fetchOnce({ showLoading: true });
  }, [fetchOnce]);

  // Background polling: stops automatically on terminal status
  useEffect(() => {
    if (!state.vm) return;
    if (TERMINAL_STATUSES.has(state.vm.status)) return;

    const id = setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.vm?.status, fetchOnce]);

  const reload = useCallback(
    () => void fetchOnce({ showLoading: true }),
    [fetchOnce],
  );

  return { ...state, reload };
}
