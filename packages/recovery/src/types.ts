/**
 * Type contract for FloweyPay Recovery Packages (schema_version = 1).
 *
 * A Recovery Package is a JSON, watch-only snapshot. It never contains seed,
 * xprv/tprv, WIF, or any other spending material. See README for the full
 * security boundary.
 */

/** Only schema version currently supported. */
export const SCHEMA_VERSION_V1 = 1 as const;

/** Only signature algorithm currently supported. */
export const SIGNATURE_ALGORITHM = "Ed25519" as const;

/** Bitcoin networks a Recovery Package may describe. */
export type NetworkName = "mainnet" | "testnet" | "signet" | "regtest";

/**
 * Inclusive derivation index range recommended for a watch-only rescan/import.
 * `start` and `end` are non-negative safe integers with `start <= end`.
 */
export interface RecommendedImportRange {
  start: number;
  end: number;
}

/**
 * Public recovery material for a single historical wallet version.
 *
 * Contains only the watch-only information needed to re-identify and re-import
 * an older wallet version if FloweyPay no longer exists. No private material.
 */
export interface WalletRotationHistoryEntryV1 {
  /** Monotonic wallet version number (non-negative safe integer). */
  version: number;
  /** Watch-only output descriptor (public keys only). */
  descriptor: string;
  /** Descriptor checksum. */
  checksum: string;
  /** Public BIP32 master key fingerprint (hex). */
  master_fingerprint: string;
  /** BIP32 derivation path, e.g. "m/84'/0'/0'". */
  derivation_path: string;
  /** Output script type, e.g. "wpkh". */
  script_type: string;
  /** Highest allocated index for this version, or null if nothing was allocated. */
  last_allocated_index: number | null;
  /** Highest funded index observed for this version, or null if never funded. */
  last_funded_index: number | null;
  /**
   * Recommended inclusive index range to import/rescan for this version.
   * Required because a version may have allocated beyond its last funded index.
   */
  recommended_import_range: RecommendedImportRange;
  /** Canonical UTC ISO-8601 timestamp of when this version was rotated out. */
  rotated_at: string;
}

/**
 * The signed body of a Recovery Package. Supplied by the caller; this package
 * does not query Prisma, Bitcoin Core, or any service to populate it.
 */
export interface RecoveryPackagePayloadV1 {
  schema_version: typeof SCHEMA_VERSION_V1;
  /** Target Bitcoin network. */
  network: NetworkName;
  /** Current output script type, e.g. "wpkh". */
  script_type: string;
  /** Current watch-only output descriptor (public keys only). */
  descriptor: string;
  /** Descriptor checksum. */
  checksum: string;
  /** Public BIP32 master key fingerprint (hex). */
  master_fingerprint: string;
  /** BIP32 derivation path, e.g. "m/84'/0'/0'". */
  derivation_path: string;
  /** First receive address (index 0), public. */
  address_index_0: string;
  /** Highest allocated index, or null if nothing has been allocated yet. */
  last_allocated_index: number | null;
  /** Highest funded index, or null if nothing has been funded yet. */
  last_funded_index: number | null;
  /** Recommended inclusive index range to import/rescan. */
  recommended_import_range: RecommendedImportRange;
  /** Address gap limit (non-negative safe integer). */
  gap_limit: number;
  /** Ordered history of prior wallet versions. Order is significant. */
  wallet_rotation_history: WalletRotationHistoryEntryV1[];
  /** ISO-8601 UTC timestamp when this package was generated. */
  generated_at: string;
}

/**
 * Detached signature envelope. NOT part of the signed bytes.
 */
export interface RecoverySignatureV1 {
  algorithm: typeof SIGNATURE_ALGORITHM;
  /** Non-empty identifier of the signing key (enables rotation). */
  key_id: string;
  /** Base64-encoded raw Ed25519 signature. */
  value: string;
}

/** A payload plus its detached signature. */
export interface SignedRecoveryPackageV1 {
  payload: RecoveryPackagePayloadV1;
  signature: RecoverySignatureV1;
}

/** Base class for all errors thrown by this package. */
export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when input crossing the package boundary fails validation. */
export class RecoveryValidationError extends RecoveryError {}

/** Thrown when a signature is structurally invalid or cryptographically invalid. */
export class RecoverySignatureError extends RecoveryError {}
