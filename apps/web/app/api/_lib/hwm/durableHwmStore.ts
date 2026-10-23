/**
 * API-003 — Durable High-Water-Mark (HWM) consume contract.
 *
 * This is a MINIMAL, vendor-neutral abstraction over the future INFRA-001
 * Durable HWM authority. It intentionally does NOT implement the real adapter.
 * The HWM is the single authority that durably consumes receiving-address
 * indices for a non-custodial merchant wallet version. An index it reports as
 * consumed is NEVER released, decremented, or reused by this service.
 *
 * Correctness properties the real adapter MUST provide (see INFRA-001 D5–D9):
 *  - Idempotency: the same (walletVersionId, operationId) ALWAYS resolves to
 *    the same consumed index.
 *  - Distinctness: distinct operations on the same wallet version receive
 *    distinct, monotonically increasing indices.
 *  - Monotonic + never-released: consumed indices only move forward.
 *  - Fail-closed: when the store is unavailable, a record is missing, or the
 *    outcome is AMBIGUOUS, consumption MUST fail — never guess, never fall back
 *    to the operational PostgreSQL ledger (MAX(index)+1) as an HWM authority.
 *
 * API-003 ships only the fail-closed missing-adapter implementation so
 * production is blocked until the real INFRA-001 adapter is wired in.
 */

export const HWM_ERROR_CODES = {
  /** No production adapter is configured — production is fail-closed. */
  ADAPTER_MISSING: "HWM_ADAPTER_MISSING",
  /**
   * The store is definitely unavailable / the consume definitely did not
   * happen. Safe to retry with the SAME operationId.
   */
  UNAVAILABLE: "HWM_UNAVAILABLE",
  /**
   * The outcome is AMBIGUOUS (e.g. a timeout): the consume MAY or MAY NOT have
   * durably happened. The caller MUST retry with the SAME operationId and MUST
   * NOT treat the index as free. Never classify this as a definite failure.
   */
  AMBIGUOUS: "HWM_AMBIGUOUS",
} as const;

export type HwmErrorCode =
  (typeof HWM_ERROR_CODES)[keyof typeof HWM_ERROR_CODES];

/**
 * Typed HWM failure. `code` distinguishes ambiguous outcomes (retry with the
 * same operationId) from definite unavailability — the two MUST stay separable.
 */
export class HwmError extends Error {
  readonly code: HwmErrorCode;
  constructor(code: HwmErrorCode) {
    super(code);
    this.code = code;
    this.name = "HwmError";
  }
}

/** Result of a durable consume: the index durably consumed by the authority. */
export interface ConsumeResult {
  /**
   * The durably consumed external-chain index (>= 0). Callers MUST validate it
   * against the BIP84 external-index domain before derivation or persistence.
   *
   * RESIDUAL DEPENDENCY: the production adapter MUST preserve exact integer
   * semantics when converting its durable 64-bit counter into this bounded
   * BIP84 external index domain (0 <= index < 2^31). It MUST reject or refuse
   * to lossily down-convert any value outside the JS safe-integer range; a
   * silent `Number()` truncation of a large counter could otherwise yield a
   * wrong-but-in-range index. The consumer additionally re-validates the bound.
   */
  index: number;
}

/**
 * Vendor-neutral Durable HWM authority.
 *
 * RESIDUAL DEPENDENCY (distinctness): the adapter MUST map distinct
 * operationIds to DISTINCT indices for a given walletVersionId, and the same
 * (walletVersionId, operationId) to the SAME index. The operational allocation
 * ledger carries no operationId, so it alone cannot prove distinct operation
 * identity when two drafts have byte-identical payment intent — correctness of
 * operational idempotency is therefore contingent on this HWM guarantee.
 */
export interface DurableHwmStore {
  /**
   * Atomically and idempotently consume the next index for `walletVersionId`,
   * keyed by `operationId`. Re-invoking with the same pair returns the same
   * index. Throws {@link HwmError} on missing-adapter, unavailability, or
   * ambiguity — it never returns a guessed or fallback index.
   */
  consumeNext(
    walletVersionId: string,
    operationId: string
  ): Promise<ConsumeResult>;
}

/**
 * Production default: no real INFRA-001 adapter exists yet, so every consume
 * fails closed with ADAPTER_MISSING. This keeps non-custodial allocation
 * blocked in production until the durable authority is implemented.
 */
export class MissingHwmAdapter implements DurableHwmStore {
  async consumeNext(): Promise<ConsumeResult> {
    throw new HwmError(HWM_ERROR_CODES.ADAPTER_MISSING);
  }
}

/**
 * The default store used by the allocation service. Intentionally the
 * fail-closed missing adapter — wiring the real INFRA-001 adapter here is
 * out of scope for API-003.
 */
export const defaultHwmStore: DurableHwmStore = new MissingHwmAdapter();
