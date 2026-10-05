/**
 * RFC 8785 (JSON Canonicalization Scheme) wrapper.
 *
 * We deliberately delegate to the `canonicalize` package (the reference RFC 8785
 * implementation) instead of a hand-rolled key sorter. JCS defines exact rules
 * for key ordering, string escaping, and number formatting that plain
 * JSON.stringify does not satisfy.
 */
import canonicalize from "canonicalize";

import { RecoveryError } from "./types.js";

/**
 * Produce the RFC 8785 canonical JSON string for `value`.
 * Throws if the value cannot be canonicalized (e.g. contains undefined/cycles).
 */
export function canonicalizeJson(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== "string") {
    // canonicalize returns undefined for inputs it cannot represent.
    throw new RecoveryError("payload cannot be canonicalized");
  }
  return result;
}

/** UTF-8 bytes of the RFC 8785 canonical representation — the signed bytes. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalizeJson(value), "utf8");
}
