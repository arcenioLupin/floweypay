import { Prisma, payment_method, payment_status, receiving_model } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import type { BtcNet } from "@/app/api/_lib/descriptor";
import {
  deriveAddressAtIndex,
  isValidExternalIndex,
  WalletRpcError,
} from "@/app/api/_lib/walletRpc";
import {
  defaultHwmStore,
  HWM_ERROR_CODES,
  HwmError,
  type DurableHwmStore,
} from "@/app/api/_lib/hwm/durableHwmStore";

/**
 * API-003 — Internal, production-blocked receiving-address allocation service
 * for non-custodial BIP84 merchant wallet versions.
 *
 * This service is NOT a public API. It atomically creates a Payment and its
 * ATTRIBUTED wallet_address_allocations row in the operational PostgreSQL DB,
 * using an index durably consumed by the Durable HWM authority (INFRA-001).
 *
 * Non-negotiable safety invariants:
 *  - The Durable HWM is the ONLY index authority. There is NO fallback to
 *    MAX(ledger)+1. An index durably consumed by the HWM is NEVER released or
 *    reused by this service, even after a derivation or PostgreSQL failure.
 *  - Production fails closed: the default store is the missing adapter.
 *  - Database locks are NEVER held while calling Bitcoin Core or the HWM.
 *  - No private keys, no wallet imports, no RESERVED allocation state, no
 *    mutation of immutable attribution fields.
 *
 * ── Canonical lock order (MUST be honoured by all writers) ──────────────────
 * Within a single operational transaction, acquire locks in this order:
 *   1. Transaction-scoped advisory lock keyed by wallet_version_id
 *      (pg_advisory_xact_lock), then
 *   2. Row locks via `SELECT ... FOR UPDATE OF v, r` on BOTH
 *      merchant_wallet_versions (v) AND merchant_wallet_recovery_state (r),
 *      acquired together in one statement.
 * Locking only the recovery-state row is INSUFFICIENT: lifecycle transitions
 * live on the version row, so both rows must be locked to make the eligibility
 * decision authoritative. Future wallet rotation / reconciliation-to-READY
 * writers MUST coordinate with this same lock order to avoid deadlocks and to
 * preserve the eligibility gate.
 */

export const ALLOCATION_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  WALLET_VERSION_NOT_FOUND: "WALLET_VERSION_NOT_FOUND",
  WALLET_NOT_ACTIVE: "WALLET_NOT_ACTIVE",
  WALLET_NOT_READY: "WALLET_NOT_READY",
  NETWORK_MISMATCH: "NETWORK_MISMATCH",
  HWM_ADAPTER_MISSING: "HWM_ADAPTER_MISSING",
  HWM_UNAVAILABLE: "HWM_UNAVAILABLE",
  HWM_AMBIGUOUS: "HWM_AMBIGUOUS",
  DERIVATION_UNAVAILABLE: "DERIVATION_UNAVAILABLE",
  ALLOCATION_CONFLICT: "ALLOCATION_CONFLICT",
  OPERATION_INTENT_MISMATCH: "OPERATION_INTENT_MISMATCH",
} as const;

export type AllocationErrorCode =
  (typeof ALLOCATION_ERROR_CODES)[keyof typeof ALLOCATION_ERROR_CODES];

/**
 * Typed, safe allocation failure. The message is the stable code only — never
 * raw RPC text, descriptor material, or other sensitive internals.
 */
export class AllocationError extends Error {
  readonly code: AllocationErrorCode;
  constructor(code: AllocationErrorCode) {
    super(code);
    this.code = code;
    this.name = "AllocationError";
  }
}

/**
 * All payment-creation data required to materialize an attributed non-custodial
 * Payment. The service classifies method/status/receiving_model/address itself;
 * callers supply the stable payment intent plus operational (time-varying)
 * invoice fields.
 *
 * Stable INTENT fields (compared on idempotent replay): productId, creatorId,
 * amountCents, currency, btcNetwork, btcAmountSats.
 * The remaining fields are legitimately time-varying (rate lock, expiry) and
 * are excluded from intent comparison per the approved architecture.
 *
 * CALLER CONTRACT: a replay of the same operationId MAY legitimately carry a
 * refreshed FX rate / rate-lock timestamp / expiry; those differences will NOT
 * trigger OPERATION_INTENT_MISMATCH and will NOT overwrite the committed
 * Payment (the original row is returned verbatim as `reused`). Any field a
 * caller needs to be part of the idempotency identity MUST be one of the stable
 * intent fields above — do not encode identity into FX/expiry fields.
 */
export interface PaymentDraft {
  productId: string;
  creatorId: string;
  amountCents: number;
  currency: string;
  /** Intended payment network; MUST equal the wallet version network. */
  btcNetwork: BtcNet;
  btcAmountSats: bigint;

  // ── Non-intent, operational fields (not compared on replay) ──
  btcRequiredConfirmations?: number;
  btcExpiresAt?: Date | null;
  btcFxRate?: number | string | null;
  btcRateLockedAt?: Date | null;
  btcRateProvider?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
}

export interface AllocateReceivingAddressInput {
  walletVersionId: string;
  /**
   * Stable idempotency key for this payment intent. MUST remain identical
   * across retries of the same intent. The future caller owns the durable
   * mapping between its payment intent and this operationId; API-003 does NOT
   * independently persist an operationId→draft binding.
   */
  operationId: string;
  draft: PaymentDraft;
}

export interface AllocationResult {
  paymentId: string;
  btcAddress: string;
  derivationIndex: number;
  /** True iff an existing committed attribution was returned (idempotent replay). */
  reused: boolean;
}

/**
 * Injectable dependencies (defaults are the production wiring).
 *
 * RESIDUAL DEPENDENCY (safe wiring): production callers MUST obtain the HWM
 * implementation from controlled wiring (the real INFRA-001 adapter wired into
 * `defaultHwmStore`) and MUST NOT inject a store via `overrides`. The override
 * surface exists only for tests; passing a fake/in-memory HWM in production
 * would defeat the fail-closed guarantee.
 */
export interface AllocationDeps {
  prisma: typeof prisma;
  hwm: DurableHwmStore;
  deriveAddress: (descriptor: string, index: number) => Promise<string>;
}

const DEFAULT_DEPS: AllocationDeps = {
  prisma,
  hwm: defaultHwmStore,
  deriveAddress: deriveAddressAtIndex,
};

const RETRYABLE_PRISMA_CODES = new Set(["P2034"]);
const MAX_RETRIES = 3;

/** Minimal projection of a stored Payment needed to validate intent. */
interface StoredIntent {
  product_id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  btc_network: BtcNet | null;
  btc_amount_sats: bigint | null;
}

function nonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

/** Validate caller input before touching any external authority. */
function validateInput(input: AllocateReceivingAddressInput): void {
  const { walletVersionId, operationId, draft } = input;
  if (!nonEmpty(walletVersionId) || !nonEmpty(operationId)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.INVALID_INPUT);
  }
  if (!draft || !nonEmpty(draft.productId) || !nonEmpty(draft.creatorId)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.INVALID_INPUT);
  }
  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.INVALID_INPUT);
  }
  if (!nonEmpty(draft.currency)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.INVALID_INPUT);
  }
  if (typeof draft.btcAmountSats !== "bigint" || draft.btcAmountSats <= 0n) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.INVALID_INPUT);
  }
  if (!nonEmpty(draft.btcNetwork)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.INVALID_INPUT);
  }
}

/** Does a stored payment's immutable intent match the incoming draft? */
function intentMatches(stored: StoredIntent, draft: PaymentDraft): boolean {
  return (
    stored.product_id === draft.productId &&
    stored.creator_id === draft.creatorId &&
    stored.amount_cents === draft.amountCents &&
    stored.currency === draft.currency &&
    stored.btc_network === draft.btcNetwork &&
    stored.btc_amount_sats !== null &&
    stored.btc_amount_sats === draft.btcAmountSats
  );
}

/** Translate an HWM failure into the matching allocation error (fail-closed). */
function mapHwmError(err: unknown): AllocationError {
  if (err instanceof HwmError) {
    switch (err.code) {
      case HWM_ERROR_CODES.ADAPTER_MISSING:
        return new AllocationError(ALLOCATION_ERROR_CODES.HWM_ADAPTER_MISSING);
      case HWM_ERROR_CODES.AMBIGUOUS:
        return new AllocationError(ALLOCATION_ERROR_CODES.HWM_AMBIGUOUS);
      case HWM_ERROR_CODES.UNAVAILABLE:
      default:
        return new AllocationError(ALLOCATION_ERROR_CODES.HWM_UNAVAILABLE);
    }
  }
  // Any unexpected store failure is treated as definite unavailability.
  return new AllocationError(ALLOCATION_ERROR_CODES.HWM_UNAVAILABLE);
}

function isUniqueConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function isRetryableTxError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(err.code);
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("deadlock") || msg.includes("could not serialize");
  }
  return false;
}

/**
 * Resolve an existing allocation at (walletVersionId, index) into a result.
 * Attributed + intent match → idempotent reuse. Attributed + intent mismatch →
 * OPERATION_INTENT_MISMATCH. Burned (no payment) → ALLOCATION_CONFLICT.
 */
async function resolveExistingAllocation(
  reader: Pick<typeof prisma, "payments">,
  existing: { payment_id: string | null },
  address: string,
  index: number,
  draft: PaymentDraft
): Promise<AllocationResult> {
  if (!existing.payment_id) {
    // Index already burned by recovery/safety range — never attribute to it.
    throw new AllocationError(ALLOCATION_ERROR_CODES.ALLOCATION_CONFLICT);
  }
  const stored = (await reader.payments.findUnique({
    where: { id: existing.payment_id },
    select: {
      product_id: true,
      creator_id: true,
      amount_cents: true,
      currency: true,
      btc_network: true,
      btc_amount_sats: true,
    },
  })) as StoredIntent | null;

  if (!stored) {
    // Allocation references a payment we cannot read — fail closed.
    throw new AllocationError(ALLOCATION_ERROR_CODES.ALLOCATION_CONFLICT);
  }
  if (!intentMatches(stored, draft)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.OPERATION_INTENT_MISMATCH);
  }
  return {
    paymentId: existing.payment_id,
    btcAddress: address,
    derivationIndex: index,
    reused: true,
  };
}

/**
 * Allocate (or idempotently re-return) a non-custodial receiving address and
 * its attributed Payment for a merchant wallet version.
 */
export async function allocateReceivingAddress(
  input: AllocateReceivingAddressInput,
  overrides?: Partial<AllocationDeps>
): Promise<AllocationResult> {
  const deps: AllocationDeps = { ...DEFAULT_DEPS, ...overrides };
  const { prisma: db, hwm, deriveAddress } = deps;

  validateInput(input);
  const { walletVersionId, operationId, draft } = input;

  // ── 1. Initial (best-effort) eligibility check — NO locks held across the
  // external HWM / Bitcoin Core calls that follow. ──────────────────────────
  const version = await db.merchant_wallet_versions.findUnique({
    where: { id: walletVersionId },
    select: {
      lifecycle: true,
      network: true,
      descriptor: true,
      descriptor_checksum: true,
      recovery_state: { select: { recovery_state: true } },
    },
  });
  if (!version) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.WALLET_VERSION_NOT_FOUND);
  }
  if (version.lifecycle !== "ACTIVE") {
    throw new AllocationError(ALLOCATION_ERROR_CODES.WALLET_NOT_ACTIVE);
  }
  if (version.recovery_state?.recovery_state !== "READY") {
    throw new AllocationError(ALLOCATION_ERROR_CODES.WALLET_NOT_READY);
  }
  if (version.network !== draft.btcNetwork) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.NETWORK_MISMATCH);
  }
  if (!nonEmpty(version.descriptor)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE);
  }
  const descriptor = version.descriptor;
  // Captured here so the authoritative locked read can confirm the descriptor
  // identity has not changed before we persist an address derived from it.
  const expectedDescriptorChecksum = version.descriptor_checksum;

  // ── 2. Durable HWM consume (idempotent by operationId). No DB lock held. ──
  let index: number;
  try {
    const consumed = await hwm.consumeNext(walletVersionId, operationId);
    index = consumed.index;
  } catch (err) {
    throw mapHwmError(err);
  }

  // The index is now durably consumed and will NEVER be released/reused, even
  // if every step below fails. Validate it before derivation or persistence.
  if (!isValidExternalIndex(index)) {
    throw new AllocationError(ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE);
  }

  // ── 3. Idempotent fast-path replay: if this index already carries an
  // attributed allocation, return (or reject) without re-deriving. ──────────
  const preExisting = await db.wallet_address_allocations.findUnique({
    where: {
      wallet_version_id_derivation_index: {
        wallet_version_id: walletVersionId,
        derivation_index: BigInt(index),
      },
    },
    select: { btc_address: true, payment_id: true },
  });
  if (preExisting) {
    return resolveExistingAllocation(
      db,
      preExisting,
      preExisting.btc_address,
      index,
      draft
    );
  }

  // ── 4. Deterministic derivation via Bitcoin Core (no DB lock held). A
  // failure here leaves the consumed index intact — it is never reused. ─────
  let btcAddress: string;
  try {
    btcAddress = await deriveAddress(descriptor, index);
  } catch (err) {
    if (err instanceof WalletRpcError) {
      throw new AllocationError(ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE);
    }
    throw err;
  }

  // ── 5. Atomic persistence under the canonical lock order, with retry for
  // transient conflicts and idempotent resolution of unique races. ─────────
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        // (a) advisory lock keyed by wallet version.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${walletVersionId}, 0))`;

        // (b) authoritative row locks on BOTH version and recovery-state rows.
        const lockedRows = await tx.$queryRaw<
          Array<{
            lifecycle: string;
            network: string;
            recovery_state: string;
            descriptor_checksum: string;
          }>
        >`
          SELECT v.lifecycle::text       AS lifecycle,
                 v.network::text         AS network,
                 v.descriptor_checksum   AS descriptor_checksum,
                 r.recovery_state::text  AS recovery_state
          FROM merchant_wallet_versions v
          JOIN merchant_wallet_recovery_state r
            ON r.wallet_version_id = v.id
          WHERE v.id = ${walletVersionId}::uuid
          FOR UPDATE OF v, r
        `;

        const locked = lockedRows[0];
        if (!locked) {
          throw new AllocationError(
            ALLOCATION_ERROR_CODES.WALLET_VERSION_NOT_FOUND
          );
        }
        if (locked.lifecycle !== "ACTIVE") {
          throw new AllocationError(ALLOCATION_ERROR_CODES.WALLET_NOT_ACTIVE);
        }
        if (locked.recovery_state !== "READY") {
          throw new AllocationError(ALLOCATION_ERROR_CODES.WALLET_NOT_READY);
        }
        if (locked.network !== draft.btcNetwork) {
          throw new AllocationError(ALLOCATION_ERROR_CODES.NETWORK_MISMATCH);
        }
        // Authoritative descriptor-identity re-check under lock. The address was
        // derived from the descriptor read in the unlocked step 1; if the
        // version's descriptor identity changed in between, that address can no
        // longer be trusted, so fail closed before persisting anything. (Per
        // schema this is immutable per version id — this is defense in depth.)
        if (locked.descriptor_checksum !== expectedDescriptorChecksum) {
          throw new AllocationError(
            ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE
          );
        }

        // (c) idempotency re-check under lock.
        const underLock = await tx.wallet_address_allocations.findUnique({
          where: {
            wallet_version_id_derivation_index: {
              wallet_version_id: walletVersionId,
              derivation_index: BigInt(index),
            },
          },
          select: { btc_address: true, payment_id: true },
        });
        if (underLock) {
          return resolveExistingAllocation(
            tx,
            underLock,
            underLock.btc_address,
            index,
            draft
          );
        }

        // (d) create Payment + ATTRIBUTED allocation together.
        const payment = await tx.payments.create({
          data: {
            product_id: draft.productId,
            creator_id: draft.creatorId,
            method: payment_method.BTC_ONCHAIN,
            status: payment_status.AWAITING_PAYMENT,
            receiving_model: receiving_model.NON_CUSTODIAL_DERIVED,
            amount_cents: draft.amountCents,
            currency: draft.currency,
            btc_network: draft.btcNetwork,
            btc_address: btcAddress,
            btc_amount_sats: draft.btcAmountSats,
            btc_required_confirmations: draft.btcRequiredConfirmations,
            btc_expires_at: draft.btcExpiresAt ?? undefined,
            btc_fx_rate: draft.btcFxRate ?? undefined,
            btc_rate_locked_at: draft.btcRateLockedAt ?? undefined,
            btc_rate_provider: draft.btcRateProvider ?? undefined,
            payer_name: draft.payerName ?? undefined,
            payer_email: draft.payerEmail ?? undefined,
          },
          select: { id: true },
        });

        await tx.wallet_address_allocations.create({
          data: {
            wallet_version_id: walletVersionId,
            derivation_index: BigInt(index),
            btc_address: btcAddress,
            network: draft.btcNetwork,
            payment_id: payment.id,
            burn_reason: null,
            assigned_at: new Date(),
          },
          select: { id: true },
        });

        return {
          paymentId: payment.id,
          btcAddress,
          derivationIndex: index,
          reused: false,
        } satisfies AllocationResult;
      });
    } catch (err) {
      // A concurrent attempt won the race on this index/address. Let DB
      // uniqueness arbitrate, then re-read and compare the winner's intent.
      if (isUniqueConflict(err)) {
        const winner = await db.wallet_address_allocations.findUnique({
          where: {
            wallet_version_id_derivation_index: {
              wallet_version_id: walletVersionId,
              derivation_index: BigInt(index),
            },
          },
          select: { btc_address: true, payment_id: true },
        });
        if (winner) {
          return resolveExistingAllocation(
            db,
            winner,
            winner.btc_address,
            index,
            draft
          );
        }
        // Conflict was on a different uniqueness constraint (e.g. address).
        throw new AllocationError(ALLOCATION_ERROR_CODES.ALLOCATION_CONFLICT);
      }
      if (isRetryableTxError(err) && attempt < MAX_RETRIES) {
        continue;
      }
      throw err;
    }
  }

  // Exhausted retries on transient conflicts.
  throw new AllocationError(ALLOCATION_ERROR_CODES.ALLOCATION_CONFLICT);
}
