import { NextResponse } from "next/server";
import type {
  btc_network,
  monitoring_status,
  recovery_state,
  wallet_lifecycle,
  wallet_script_type,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";

/**
 * API-004 — GET /api/wallet/config
 *
 * Merchant-authenticated, read-only view of the caller's own wallet
 * configuration and persisted lifecycle/recovery status. The wallet is resolved
 * EXCLUSIVELY from the authenticated merchant id (session) — no wallet or
 * merchant identifier is ever accepted from the client, so cross-merchant
 * reads are structurally impossible.
 *
 * This endpoint performs NO database writes, NO Bitcoin Core / RPC calls, and
 * NO Durable HWM access. It only reads already-persisted PostgreSQL state.
 *
 * ── Readiness semantics ─────────────────────────────────────────────────────
 * `walletReady` reflects ONLY persisted wallet eligibility:
 *     walletReady = (exactly one ACTIVE version)
 *                   && activeVersion.lifecycle === "ACTIVE"
 *                   && recoveryState === "READY"
 * It FAILS CLOSED on any missing/ambiguous data (no wallet, no ACTIVE version,
 * multiple ACTIVE versions, or missing recovery-state record).
 *
 * `walletReady === true` means ONLY that the persisted eligibility gate is
 * satisfied. It makes NO claim that Bitcoin Core is online, that the Durable
 * HWM is operational, that address allocation is currently available, or that
 * the merchant can receive payments end-to-end. Those are independent runtime
 * concerns owned by API-003 / INFRA-001 and are deliberately NOT surfaced here.
 *
 * ── Data minimization ───────────────────────────────────────────────────────
 * Descriptors, extended public keys, descriptor checksums, master fingerprints,
 * derivation paths, HWM counters / derivation indices, monitoring range
 * indices, internal monitoring error messages, and lock versions are NEVER
 * selected or returned. Only an explicit, minimal DTO is emitted.
 */

export const dynamic = "force-dynamic";

/** Merchant-specific data must never be cached by browsers or intermediaries. */
const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/** Minimal projection of an ACTIVE wallet version (no sensitive fields). */
export interface WalletVersionRow {
  version: number;
  network: btc_network;
  script_type: wallet_script_type;
  lifecycle: wallet_lifecycle;
  recovery_state: { recovery_state: recovery_state } | null;
  monitoring: { monitoring_status: monitoring_status } | null;
}

/** Minimal projection of a merchant wallet with its ACTIVE versions only. */
export interface WalletConfigRow {
  id: string;
  versions: WalletVersionRow[];
}

export type WalletConfigData =
  | { configured: false }
  | {
      configured: true;
      walletId: string;
      activeVersion: {
        version: number;
        network: btc_network;
        scriptType: wallet_script_type;
        lifecycle: wallet_lifecycle;
      } | null;
      status: {
        recoveryState: recovery_state | null;
        monitoringStatus: monitoring_status | null;
        walletReady: boolean;
      };
    };

export interface WalletConfigDeps {
  /** Resolves the authenticated merchant id or throws "UNAUTHORIZED". */
  getMerchantId: () => Promise<string>;
  /** Loads the merchant's own wallet config row (ACTIVE versions only). */
  loadWalletConfigRow: (merchantId: string) => Promise<WalletConfigRow | null>;
}

/**
 * Build the safe DTO from the persisted row. Pure and fail-closed:
 *  - no row                      → { configured: false }
 *  - not exactly one ACTIVE ver  → activeVersion: null, walletReady: false
 *  - missing recovery record     → recoveryState: null, walletReady: false
 *  - missing monitoring record   → monitoringStatus: null (never VERIFIED)
 */
export function buildWalletConfigData(
  row: WalletConfigRow | null
): WalletConfigData {
  if (!row) return { configured: false };

  const activeVersions = row.versions.filter((v) => v.lifecycle === "ACTIVE");

  // Fail closed: no single ACTIVE version → never expose or "ready" an
  // arbitrary version.
  if (activeVersions.length !== 1) {
    return {
      configured: true,
      walletId: row.id,
      activeVersion: null,
      status: {
        recoveryState: null,
        monitoringStatus: null,
        walletReady: false,
      },
    };
  }

  const v = activeVersions[0];
  const recoveryState = v.recovery_state?.recovery_state ?? null;
  const monitoringStatus = v.monitoring?.monitoring_status ?? null;
  const walletReady = v.lifecycle === "ACTIVE" && recoveryState === "READY";

  return {
    configured: true,
    walletId: row.id,
    activeVersion: {
      version: v.version,
      network: v.network,
      scriptType: v.script_type,
      lifecycle: v.lifecycle,
    },
    status: {
      recoveryState,
      monitoringStatus,
      walletReady,
    },
  };
}

function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Default production wiring: real session auth + scoped Prisma read. */
const defaultDeps: WalletConfigDeps = {
  getMerchantId: requireUserId,
  loadWalletConfigRow: (merchantId) =>
    prisma.merchant_wallets.findUnique({
      // Ownership is enforced here: the lookup key is the authenticated
      // merchant id, never a client-supplied value.
      where: { merchant_id: merchantId },
      select: {
        id: true,
        versions: {
          where: { lifecycle: "ACTIVE" },
          select: {
            version: true,
            network: true,
            script_type: true,
            lifecycle: true,
            recovery_state: { select: { recovery_state: true } },
            monitoring: { select: { monitoring_status: true } },
          },
        },
      },
    }),
};

export async function handleWalletConfig(
  deps: WalletConfigDeps
): Promise<NextResponse> {
  let merchantId: string;
  try {
    merchantId = await deps.getMerchantId();
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return jsonNoStore({ success: false, message: "UNAUTHORIZED" }, 401);
    }
    // Any other failure in the auth path is reported generically.
    return jsonNoStore({ success: false, message: "INTERNAL_ERROR" }, 500);
  }

  try {
    const row = await deps.loadWalletConfigRow(merchantId);
    const data = buildWalletConfigData(row);
    return jsonNoStore({ success: true, data }, 200);
  } catch {
    // Never surface exception details (RPC text, SQL, stack traces, secrets).
    return jsonNoStore({ success: false, message: "INTERNAL_ERROR" }, 500);
  }
}

export async function GET(): Promise<NextResponse> {
  return handleWalletConfig(defaultDeps);
}
