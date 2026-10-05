/**
 * Fail-closed runtime validation for data crossing the package boundary.
 *
 * Security-sensitive input is rejected, never silently normalized. Error
 * messages are intentionally generic: descriptors, signatures, and key material
 * are never embedded in thrown messages or logs.
 */
import {
  RecoveryValidationError,
  SCHEMA_VERSION_V1,
  SIGNATURE_ALGORITHM,
  type NetworkName,
  type RecommendedImportRange,
  type RecoveryPackagePayloadV1,
  type RecoverySignatureV1,
  type SignedRecoveryPackageV1,
  type WalletRotationHistoryEntryV1,
} from "./types.js";

const NETWORKS: ReadonlySet<string> = new Set([
  "mainnet",
  "testnet",
  "signet",
  "regtest",
]);

/** Keys that would indicate private/spending material anywhere in the object. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "seed",
  "mnemonic",
  "passphrase",
  "xprv",
  "tprv",
  "yprv",
  "zprv",
  "uprv",
  "vprv",
  "privkey",
  "priv_key",
  "privatekey",
  "private_key",
  "wif",
  "secret",
  "secret_key",
  "master_private_key",
  "spend_key",
  "spending_key",
]);

/**
 * Extended *private* key prefixes (BIP32 serialization). Public recovery fields
 * must never contain these. We match the HRP-like prefix followed by Base58
 * characters to avoid matching unrelated substrings.
 */
const PRIVATE_EXTKEY_PATTERN =
  /\b(?:xprv|tprv|yprv|zprv|uprv|vprv)[1-9A-HJ-NP-Za-km-z]{6,}/;

const STRICT_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Largest valid BIP32 non-hardened child index. Recovery derivation indices are
 * non-hardened child indices, so they must lie within [0, 0x7fffffff].
 */
export const MAX_BIP32_NON_HARDENED_INDEX = 0x7fffffff;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSafeNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isBip32Index(value: unknown): value is number {
  return isSafeNonNegativeInt(value) && value <= MAX_BIP32_NON_HARDENED_INDEX;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Closed-schema guard: reject any own property not in `allowed`. V1 objects
 * fail closed on unexpected properties rather than silently stripping them.
 */
function assertNoUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new RecoveryValidationError(`${context} contains an unknown property`);
    }
  }
}

/**
 * Require a canonical JavaScript UTC ISO-8601 timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)
 * that represents a real date and round-trips exactly through Date.toISOString().
 * Rejects offsets, local times, invalid dates, and non-canonical ISO variants.
 */
function assertCanonicalUtcTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RecoveryValidationError(
      `${field} must be a canonical UTC ISO-8601 timestamp`,
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new RecoveryValidationError(
      `${field} must be a canonical UTC ISO-8601 timestamp`,
    );
  }
  return value;
}

/**
 * Recursively reject any forbidden key name or private extended-key material,
 * regardless of where it appears in an untrusted parsed object.
 */
function scanForPrivateMaterial(value: unknown, depth = 0): void {
  if (depth > 64) {
    throw new RecoveryValidationError("input nesting too deep");
  }
  if (typeof value === "string") {
    if (PRIVATE_EXTKEY_PATTERN.test(value)) {
      throw new RecoveryValidationError(
        "private extended key material is not permitted",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) scanForPrivateMaterial(item, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new RecoveryValidationError(
          "private/secret field is not permitted in a Recovery Package",
        );
      }
      scanForPrivateMaterial(value[key], depth + 1);
    }
  }
}

function assertNonNegativeIntOrNull(
  value: unknown,
  field: string,
): number | null {
  if (value === null) return null;
  if (!isSafeNonNegativeInt(value)) {
    throw new RecoveryValidationError(
      `${field} must be a non-negative safe integer or null`,
    );
  }
  return value;
}

/** A BIP32 non-hardened derivation index in [0, 0x7fffffff], or null. */
function assertBip32IndexOrNull(
  value: unknown,
  field: string,
): number | null {
  if (value === null) return null;
  if (!isBip32Index(value)) {
    throw new RecoveryValidationError(
      `${field} must be a BIP32 non-hardened index (0..0x7fffffff) or null`,
    );
  }
  return value;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new RecoveryValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

function assertRecommendedRange(value: unknown): RecommendedImportRange {
  if (!isPlainObject(value)) {
    throw new RecoveryValidationError(
      "recommended_import_range must be an object",
    );
  }
  assertNoUnknownKeys(value, ["start", "end"], "recommended_import_range");
  if (!isBip32Index(value.start) || !isBip32Index(value.end)) {
    throw new RecoveryValidationError(
      "recommended_import_range.start/end must be BIP32 non-hardened indices (0..0x7fffffff)",
    );
  }
  if (value.end < value.start) {
    throw new RecoveryValidationError(
      "recommended_import_range.end must be >= start",
    );
  }
  return { start: value.start, end: value.end };
}

const ROTATION_ENTRY_KEYS = [
  "version",
  "descriptor",
  "checksum",
  "master_fingerprint",
  "derivation_path",
  "script_type",
  "last_allocated_index",
  "last_funded_index",
  "recommended_import_range",
  "rotated_at",
] as const;

function assertRotationEntry(
  value: unknown,
): WalletRotationHistoryEntryV1 {
  if (!isPlainObject(value)) {
    throw new RecoveryValidationError(
      "wallet_rotation_history entries must be objects",
    );
  }
  assertNoUnknownKeys(value, ROTATION_ENTRY_KEYS, "wallet_rotation_history entry");
  if (!isSafeNonNegativeInt(value.version)) {
    throw new RecoveryValidationError(
      "rotation entry version must be a non-negative safe integer",
    );
  }
  return {
    version: value.version,
    descriptor: assertNonEmptyString(value.descriptor, "rotation descriptor"),
    checksum: assertNonEmptyString(value.checksum, "rotation checksum"),
    master_fingerprint: assertNonEmptyString(
      value.master_fingerprint,
      "rotation master_fingerprint",
    ),
    derivation_path: assertNonEmptyString(
      value.derivation_path,
      "rotation derivation_path",
    ),
    script_type: assertNonEmptyString(value.script_type, "rotation script_type"),
    last_allocated_index: assertBip32IndexOrNull(
      value.last_allocated_index,
      "rotation last_allocated_index",
    ),
    last_funded_index: assertBip32IndexOrNull(
      value.last_funded_index,
      "rotation last_funded_index",
    ),
    recommended_import_range: assertRecommendedRange(
      value.recommended_import_range,
    ),
    rotated_at: assertCanonicalUtcTimestamp(
      value.rotated_at,
      "rotation rotated_at",
    ),
  };
}

/**
 * Validate an untrusted value as a RecoveryPackagePayloadV1. Returns a
 * normalized deep copy containing only the known fields; never mutates input.
 */
const PAYLOAD_KEYS = [
  "schema_version",
  "network",
  "script_type",
  "descriptor",
  "checksum",
  "master_fingerprint",
  "derivation_path",
  "address_index_0",
  "last_allocated_index",
  "last_funded_index",
  "recommended_import_range",
  "gap_limit",
  "wallet_rotation_history",
  "generated_at",
] as const;

export function assertValidPayloadV1(
  input: unknown,
): RecoveryPackagePayloadV1 {
  if (!isPlainObject(input)) {
    throw new RecoveryValidationError("payload must be an object");
  }

  // Reject private/secret material before inspecting individual fields.
  scanForPrivateMaterial(input);

  // Closed V1 schema: reject unknown own properties.
  assertNoUnknownKeys(input, PAYLOAD_KEYS, "payload");

  if (input.schema_version !== SCHEMA_VERSION_V1) {
    throw new RecoveryValidationError(
      `unsupported schema_version (expected ${SCHEMA_VERSION_V1})`,
    );
  }

  if (!isNonEmptyString(input.network) || !NETWORKS.has(input.network)) {
    throw new RecoveryValidationError("unsupported or missing network");
  }
  const network = input.network as NetworkName;

  if (!Array.isArray(input.wallet_rotation_history)) {
    throw new RecoveryValidationError(
      "wallet_rotation_history must be an array",
    );
  }
  // Order is semantically significant and preserved here.
  const rotation = input.wallet_rotation_history.map(assertRotationEntry);

  const payload: RecoveryPackagePayloadV1 = {
    schema_version: SCHEMA_VERSION_V1,
    network,
    script_type: assertNonEmptyString(input.script_type, "script_type"),
    descriptor: assertNonEmptyString(input.descriptor, "descriptor"),
    checksum: assertNonEmptyString(input.checksum, "checksum"),
    master_fingerprint: assertNonEmptyString(
      input.master_fingerprint,
      "master_fingerprint",
    ),
    derivation_path: assertNonEmptyString(
      input.derivation_path,
      "derivation_path",
    ),
    address_index_0: assertNonEmptyString(
      input.address_index_0,
      "address_index_0",
    ),
    last_allocated_index: assertBip32IndexOrNull(
      input.last_allocated_index,
      "last_allocated_index",
    ),
    last_funded_index: assertBip32IndexOrNull(
      input.last_funded_index,
      "last_funded_index",
    ),
    recommended_import_range: assertRecommendedRange(
      input.recommended_import_range,
    ),
    gap_limit: (() => {
      if (!isSafeNonNegativeInt(input.gap_limit)) {
        throw new RecoveryValidationError(
          "gap_limit must be a non-negative safe integer",
        );
      }
      // A gap_limit that could push a derived index past the BIP32 range is invalid.
      if (input.gap_limit > MAX_BIP32_NON_HARDENED_INDEX) {
        throw new RecoveryValidationError(
          "gap_limit must not exceed the BIP32 non-hardened index space",
        );
      }
      return input.gap_limit;
    })(),
    wallet_rotation_history: rotation,
    generated_at: assertCanonicalUtcTimestamp(input.generated_at, "generated_at"),
  };

  return payload;
}

/**
 * Validate an untrusted value as a RecoverySignatureV1 envelope. Does not
 * perform cryptographic verification.
 */
export function assertValidSignatureV1(input: unknown): RecoverySignatureV1 {
  if (!isPlainObject(input)) {
    throw new RecoveryValidationError("signature must be an object");
  }
  assertNoUnknownKeys(input, ["algorithm", "key_id", "value"], "signature");
  if (input.algorithm !== SIGNATURE_ALGORITHM) {
    throw new RecoveryValidationError(
      `unsupported signature algorithm (expected ${SIGNATURE_ALGORITHM})`,
    );
  }
  if (!isNonEmptyString(input.key_id)) {
    throw new RecoveryValidationError("signature key_id must be a non-empty string");
  }
  if (!isNonEmptyString(input.value) || !STRICT_BASE64.test(input.value)) {
    throw new RecoveryValidationError("signature value must be valid Base64");
  }
  return {
    algorithm: SIGNATURE_ALGORITHM,
    key_id: input.key_id,
    value: input.value,
  };
}

/** Validate an untrusted value as a SignedRecoveryPackageV1 envelope shape. */
export function assertValidSignedPackageShape(
  input: unknown,
): { payload: unknown; signature: RecoverySignatureV1 } {
  if (!isPlainObject(input)) {
    throw new RecoveryValidationError("signed package must be an object");
  }
  assertNoUnknownKeys(input, ["payload", "signature"], "signed package");
  const signature = assertValidSignatureV1(input.signature);
  return { payload: input.payload, signature };
}

/** Strictly decode a Base64 signature value to bytes. */
export function decodeBase64Signature(value: string): Buffer {
  if (!STRICT_BASE64.test(value)) {
    throw new RecoveryValidationError("signature value must be valid Base64");
  }
  const buf = Buffer.from(value, "base64");
  // Round-trip guard against lenient decoding of non-canonical Base64.
  if (buf.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
    throw new RecoveryValidationError("signature value is not canonical Base64");
  }
  return buf;
}

export type { SignedRecoveryPackageV1 };
