/**
 * @floweypay/recovery — signed, watch-only Recovery Package domain primitive.
 *
 * Public API. See README.md for the security boundary and guarantees.
 */
export {
  SCHEMA_VERSION_V1,
  SIGNATURE_ALGORITHM,
  RecoveryError,
  RecoveryValidationError,
  RecoverySignatureError,
  type NetworkName,
  type RecommendedImportRange,
  type WalletRotationHistoryEntryV1,
  type RecoveryPackagePayloadV1,
  type RecoverySignatureV1,
  type SignedRecoveryPackageV1,
} from "./types.js";

export { canonicalizeJson, canonicalBytes } from "./canonicalize.js";

export {
  assertValidPayloadV1,
  assertValidSignatureV1,
  assertValidSignedPackageShape,
  decodeBase64Signature,
  MAX_BIP32_NON_HARDENED_INDEX,
} from "./validation.js";

export {
  signRecoveryPackage,
  createKeyObjectSigner,
  type RecoverySigner,
} from "./signer.js";

export {
  verifyRecoveryPackage,
  createTrustedKeyResolver,
  type TrustedKeyResolver,
} from "./verifier.js";
