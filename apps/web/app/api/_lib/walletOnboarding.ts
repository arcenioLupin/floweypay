import crypto from "crypto";

/**
 * API-001 — Onboarding challenge helpers and persistence contracts.
 *
 * Pure, deterministic logic (token hashing, confirm evaluation, initial-state
 * constants) kept separate from Prisma so it is independently unit-testable.
 * The atomic consume+persist transaction lives in the confirm route.
 */

// Short TTL for the Address #0 confirmation challenge.
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

// Max wrong Address #0 confirmations before the challenge is locked out.
export const MAX_CONFIRM_ATTEMPTS = 5;

// Request body / field size limits (abuse prevention).
export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_WALLET_MATERIAL_LEN = 1024;
export const MAX_ADDRESS_LEN = 128;

// Initial wallet state (approved: ACTIVE + fail-closed recovery/monitoring).
export const INITIAL_VERSION = 1;
export const INITIAL_LIFECYCLE = "ACTIVE";
export const INITIAL_SCRIPT_TYPE = "P2WPKH";
export const INITIAL_RECOVERY_STATE = "RECOVERY_REQUIRED";
export const INITIAL_RECOVERY_REASON = "INITIAL_ESTABLISHMENT";
export const INITIAL_MONITORING_STATUS = "PENDING";
export const WALLET_CREATED_EVENT = "WALLET_CREATED";
export const WALLET_CREATED_ACTOR = "MERCHANT";

// Error codes surfaced by the onboarding endpoints that are not already
// produced by the descriptor / RPC layers.
export const ONBOARDING_ERROR_CODES = {
  ALREADY_EXISTS: "WALLET_ALREADY_EXISTS",
  ADDRESS0_MISMATCH: "WALLET_ADDRESS0_MISMATCH",
  CHALLENGE_INVALID: "WALLET_CHALLENGE_INVALID",
  CHALLENGE_EXPIRED: "WALLET_CHALLENGE_EXPIRED",
} as const;

/** Map a wallet-domain error code to its HTTP status. Defaults to 400. */
export function walletErrorStatus(code: string): number {
  switch (code) {
    case "WALLET_ALREADY_EXISTS":
      return 409;
    case "WALLET_NODE_UNAVAILABLE":
      return 503;
    case "UNAUTHORIZED":
      return 401;
    default:
      // All validation-class wallet errors are client errors.
      return 400;
  }
}

export function generateChallengeToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashChallengeToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface ChallengeRow {
  merchant_id: string;
  address0: string;
  expires_at: Date;
  consumed_at: Date | null;
  attempts: number;
}

export type ConfirmDecision =
  | "CONSUME"
  | "MISMATCH"
  | "EXPIRED"
  | "CONSUMED"
  | "TOO_MANY_ATTEMPTS"
  | "NOT_FOUND"
  | "CROSS_MERCHANT";

export interface EvaluateConfirmInput {
  row: ChallengeRow | null;
  merchantId: string;
  confirmedAddress0: string;
  now: Date;
  maxAttempts: number;
}

/**
 * Decide the outcome of a confirm attempt. Order matters: structural rejections
 * (not found / cross-merchant / consumed / expired / attempts) precede the
 * address comparison so a mismatch only ever applies to a live, owned challenge.
 */
export function evaluateConfirm(input: EvaluateConfirmInput): ConfirmDecision {
  const { row, merchantId, confirmedAddress0, now, maxAttempts } = input;
  if (!row) return "NOT_FOUND";
  if (row.merchant_id !== merchantId) return "CROSS_MERCHANT";
  if (row.consumed_at !== null) return "CONSUMED";
  if (row.expires_at.getTime() <= now.getTime()) return "EXPIRED";
  if (row.attempts >= maxAttempts) return "TOO_MANY_ATTEMPTS";
  if (row.address0 !== confirmedAddress0) return "MISMATCH";
  return "CONSUME";
}

/** Redact a master fingerprint for safe display (first 4 + last 2 hex). */
export function redactFingerprint(fp: string): string {
  if (fp.length <= 6) return "****";
  return `${fp.slice(0, 4)}…${fp.slice(-2)}`;
}
