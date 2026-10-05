/**
 * Ed25519 signing of Recovery Packages using Node's native crypto.
 *
 * Private signing keys are supplied by the caller and are never persisted,
 * logged, or embedded by this package. The signing key is a FloweyPay
 * document-authenticity key — NOT a Bitcoin wallet/spending key.
 */
import { type KeyObject, sign as nodeSign } from "node:crypto";

import { canonicalBytes } from "./canonicalize.js";
import { assertValidPayloadV1 } from "./validation.js";
import {
  RecoverySignatureError,
  SIGNATURE_ALGORITHM,
  type RecoveryPackagePayloadV1,
  type SignedRecoveryPackageV1,
} from "./types.js";

/**
 * Narrow signing abstraction. Callers may back this with a Node KeyObject, an
 * HSM/KMS client, or any other Ed25519 signer. The caller owns key lifecycle.
 */
export interface RecoverySigner {
  /** Identifier recorded as `signature.key_id`; enables rotation. */
  readonly keyId: string;
  /** Produce a raw Ed25519 signature over `message`. */
  sign(message: Buffer): Buffer;
}

/** Build a RecoverySigner from a Node Ed25519 private KeyObject. */
export function createKeyObjectSigner(
  keyId: string,
  privateKey: KeyObject,
): RecoverySigner {
  if (!keyId.trim()) {
    throw new RecoverySignatureError("keyId must be a non-empty string");
  }
  if (
    privateKey.type !== "private" ||
    privateKey.asymmetricKeyType !== "ed25519"
  ) {
    throw new RecoverySignatureError("signing key must be an Ed25519 private key");
  }
  return {
    keyId,
    sign(message: Buffer): Buffer {
      // Ed25519 requires a null algorithm in Node's sign().
      return nodeSign(null, message, privateKey);
    },
  };
}

/**
 * Validate `payload`, canonicalize it per RFC 8785, and produce a detached
 * Ed25519 signature. The input payload is never mutated; the returned package
 * contains a validated deep copy.
 */
export function signRecoveryPackage(
  payload: RecoveryPackagePayloadV1,
  signer: RecoverySigner,
): SignedRecoveryPackageV1 {
  if (!signer.keyId || !signer.keyId.trim()) {
    throw new RecoverySignatureError("signer.keyId must be a non-empty string");
  }
  const validated = assertValidPayloadV1(payload);
  const message = canonicalBytes(validated);
  const signature = signer.sign(message);
  return {
    payload: validated,
    signature: {
      algorithm: SIGNATURE_ALGORITHM,
      key_id: signer.keyId,
      value: signature.toString("base64"),
    },
  };
}
