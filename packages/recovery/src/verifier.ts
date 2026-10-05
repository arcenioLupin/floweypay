/**
 * Offline, deterministic verification of signed Recovery Packages.
 *
 * Trust is established exclusively by the caller: public verification keys are
 * resolved by key_id from a caller-supplied resolver. A key embedded inside the
 * package is NEVER trusted — the package cannot establish its own trust root.
 */
import { type KeyObject, verify as nodeVerify } from "node:crypto";

import { canonicalBytes } from "./canonicalize.js";
import {
  assertValidPayloadV1,
  assertValidSignedPackageShape,
  decodeBase64Signature,
} from "./validation.js";
import {
  RecoverySignatureError,
  RecoveryValidationError,
  type RecoveryPackagePayloadV1,
} from "./types.js";

/** Resolves trusted Ed25519 public keys by key_id. */
export interface TrustedKeyResolver {
  /** Return the trusted public key for `keyId`, or undefined if unknown. */
  resolve(keyId: string): KeyObject | undefined;
}

/** Build a resolver from a static map of key_id → public KeyObject. */
export function createTrustedKeyResolver(
  keys: Readonly<Record<string, KeyObject>>,
): TrustedKeyResolver {
  return {
    resolve(keyId: string): KeyObject | undefined {
      if (!keyId || !Object.prototype.hasOwnProperty.call(keys, keyId)) {
        return undefined;
      }
      return keys[keyId];
    },
  };
}

/**
 * Verify a (possibly untrusted) signed Recovery Package. Returns the validated
 * payload on success. Fails closed on any structural, schema, or cryptographic
 * problem. Requires no network, DB, Bitcoin Core, or FloweyPay service.
 */
export function verifyRecoveryPackage(
  input: unknown,
  resolver: TrustedKeyResolver,
): RecoveryPackagePayloadV1 {
  const { payload, signature } = assertValidSignedPackageShape(input);

  // Full payload validation (incl. private-material scan) before crypto work.
  const validatedPayload = assertValidPayloadV1(payload);

  const publicKey = resolver.resolve(signature.key_id);
  if (!publicKey) {
    throw new RecoverySignatureError("unknown or untrusted signature key_id");
  }
  if (
    publicKey.type !== "public" ||
    publicKey.asymmetricKeyType !== "ed25519"
  ) {
    throw new RecoverySignatureError(
      "resolved trusted key must be an Ed25519 public key",
    );
  }

  const signatureBytes = decodeBase64Signature(signature.value);
  const message = canonicalBytes(validatedPayload);

  let ok = false;
  try {
    ok = nodeVerify(null, message, publicKey, signatureBytes);
  } catch {
    // Malformed signature length/encoding surfaces here; fail closed.
    throw new RecoverySignatureError("signature verification failed");
  }
  if (!ok) {
    throw new RecoverySignatureError("signature verification failed");
  }

  return validatedPayload;
}

export { RecoveryValidationError };
