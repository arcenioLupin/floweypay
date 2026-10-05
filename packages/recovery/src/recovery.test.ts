import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";

import {
  assertValidPayloadV1,
  canonicalizeJson,
  createKeyObjectSigner,
  createTrustedKeyResolver,
  MAX_BIP32_NON_HARDENED_INDEX,
  RecoverySignatureError,
  RecoveryValidationError,
  signRecoveryPackage,
  verifyRecoveryPackage,
  type RecoveryPackagePayloadV1,
  type SignedRecoveryPackageV1,
} from "./index.js";

// ── Helpers (ephemeral in-memory keys only; never a real private fixture) ──

function newKeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync("ed25519");
}

const KEY_ID = "floweypay-doc-2026-01";

function validPayload(): RecoveryPackagePayloadV1 {
  return {
    schema_version: 1,
    network: "signet",
    script_type: "wpkh",
    descriptor:
      "wpkh([abcd1234/84'/1'/0']xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz/0/*)#abc12345",
    checksum: "abc12345",
    master_fingerprint: "abcd1234",
    derivation_path: "m/84'/1'/0'",
    address_index_0: "tb1qexampleaddress0000000000000000000000000",
    last_allocated_index: 12,
    last_funded_index: 9,
    recommended_import_range: { start: 0, end: 112 },
    gap_limit: 100,
    wallet_rotation_history: [
      {
        version: 0,
        descriptor:
          "wpkh([abcd1234/84'/1'/0']xpub6OLDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/0/*)#old11111",
        checksum: "old11111",
        master_fingerprint: "abcd1234",
        derivation_path: "m/84'/1'/0'",
        script_type: "wpkh",
        last_allocated_index: 6,
        last_funded_index: 4,
        recommended_import_range: { start: 0, end: 106 },
        rotated_at: "2025-06-01T00:00:00.000Z",
      },
    ],
    generated_at: "2026-10-05T00:00:00.000Z",
  };
}

function sign(
  payload: RecoveryPackagePayloadV1,
  privateKey: KeyObject,
  keyId = KEY_ID,
): SignedRecoveryPackageV1 {
  return signRecoveryPackage(payload, createKeyObjectSigner(keyId, privateKey));
}

function resolverFor(publicKey: KeyObject, keyId = KEY_ID) {
  return createTrustedKeyResolver({ [keyId]: publicKey });
}

// ── 1. valid payload signs successfully ────────────────────────────────────
test("valid payload signs successfully", () => {
  const { privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  assert.equal(pkg.signature.algorithm, "Ed25519");
  assert.equal(pkg.signature.key_id, KEY_ID);
  assert.ok(pkg.signature.value.length > 0);
});

// ── 2. valid signed package verifies successfully ──────────────────────────
test("valid signed package verifies successfully", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  const out = verifyRecoveryPackage(pkg, resolverFor(publicKey));
  assert.equal(out.descriptor, validPayload().descriptor);
});

// ── 3. property order changes still verify (JCS is deterministic) ──────────
test("verification succeeds after JSON property re-ordering", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  // Rebuild payload with keys inserted in a different order.
  const reordered: Record<string, unknown> = {};
  const src = pkg.payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(src).reverse()) reordered[key] = src[key];
  const shuffled = { signature: pkg.signature, payload: reordered };
  const out = verifyRecoveryPackage(shuffled, resolverFor(publicKey));
  assert.equal(out.schema_version, 1);
});

// ── 4. modifying descriptor invalidates signature ──────────────────────────
test("modifying descriptor invalidates signature", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  pkg.payload.descriptor = pkg.payload.descriptor.replace("0/*", "1/*");
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoverySignatureError,
  );
});

// ── 5. modifying last_allocated_index invalidates signature ────────────────
test("modifying last_allocated_index invalidates signature", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  pkg.payload.last_allocated_index = 999;
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoverySignatureError,
  );
});

// ── 6. modifying rotation history invalidates signature ────────────────────
test("modifying rotation history invalidates signature", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  pkg.payload.wallet_rotation_history[0].last_funded_index = 7;
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoverySignatureError,
  );
});

// ── 7. invalid signature is rejected ───────────────────────────────────────
test("invalid signature is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  const bytes = Buffer.from(pkg.signature.value, "base64");
  bytes[0] ^= 0xff;
  pkg.signature.value = bytes.toString("base64");
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoverySignatureError,
  );
});

// ── 8. wrong public key is rejected ────────────────────────────────────────
test("wrong public key is rejected", () => {
  const { privateKey } = newKeyPair();
  const other = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(other.publicKey)),
    RecoverySignatureError,
  );
});

// ── 9. unknown key_id is rejected ──────────────────────────────────────────
test("unknown key_id is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  const resolver = createTrustedKeyResolver({ "different-key": publicKey });
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolver),
    RecoverySignatureError,
  );
});

// ── 10. unsupported algorithm is rejected ──────────────────────────────────
test("unsupported algorithm is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey) as SignedRecoveryPackageV1;
  (pkg.signature as { algorithm: string }).algorithm = "RS256";
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoveryValidationError,
  );
});

// ── 11. unsupported schema_version is rejected ─────────────────────────────
test("unsupported schema_version is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  (pkg.payload as { schema_version: number }).schema_version = 2;
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoveryValidationError,
  );
});

// ── 12. malformed Base64 is rejected ───────────────────────────────────────
test("malformed Base64 signature is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  pkg.signature.value = "not valid base64 !!!";
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoveryValidationError,
  );
});

// ── 13. negative index rejected ────────────────────────────────────────────
test("negative index is rejected", () => {
  const p = validPayload();
  p.last_allocated_index = -1;
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

// ── 14. unsafe JS integer rejected ─────────────────────────────────────────
test("unsafe integer index is rejected", () => {
  const p = validPayload();
  p.last_funded_index = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

// ── 15. invalid recommended range rejected ─────────────────────────────────
test("invalid recommended range (end < start) is rejected", () => {
  const p = validPayload();
  p.recommended_import_range = { start: 50, end: 10 };
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

// ── 16. xprv/tprv private extended key material rejected ───────────────────
test("private extended key material in descriptor is rejected", () => {
  const p = validPayload();
  p.descriptor =
    "wpkh([abcd1234/84'/1'/0']tprv8ZgxMBicQKsPeContainsPrivateKeyMaterial000000000000000000000000000000000000/0/*)#deadbeef";
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

// ── 17. seed/private-key style fields via untrusted input rejected ─────────
test("untrusted payload with seed/private-key fields is rejected", () => {
  const tainted = {
    ...validPayload(),
    seed: "abandon abandon abandon",
  } as unknown;
  assert.throws(() => assertValidPayloadV1(tainted), RecoveryValidationError);

  const taintedNested = {
    ...validPayload(),
    extra: { private_key: "deadbeef" },
  } as unknown;
  assert.throws(
    () => assertValidPayloadV1(taintedNested),
    RecoveryValidationError,
  );
});

// ── 18. package contains no Bitcoin private material ───────────────────────
test("signed package contains no private material", () => {
  const { privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  const serialized = JSON.stringify(pkg).toLowerCase();
  for (const token of ["xprv", "tprv", "seed", "mnemonic", "wif", "privkey"]) {
    assert.ok(!serialized.includes(token), `must not contain ${token}`);
  }
});

// ── 19. signing does not mutate the input payload ──────────────────────────
test("signing does not mutate the input payload", () => {
  const { privateKey } = newKeyPair();
  const input = validPayload();
  const snapshot = JSON.stringify(input);
  const pkg = sign(input, privateKey);
  assert.equal(JSON.stringify(input), snapshot);
  // Mutating the returned copy must not affect the input.
  pkg.payload.last_allocated_index = 42;
  assert.equal(JSON.stringify(input), snapshot);
});

// ── 20. verification needs no DB/Bitcoin/network/FloweyPay services ────────
test("verification is fully offline and deterministic", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  // No I/O is performed; a pure in-memory resolver suffices.
  const a = verifyRecoveryPackage(pkg, resolverFor(publicKey));
  const b = verifyRecoveryPackage(pkg, resolverFor(publicKey));
  assert.deepEqual(a, b);
});

// ── Canonicalization vector: catches accidental JSON.stringify substitution ─
test("RFC 8785 canonicalization sorts keys and formats numbers (vs JSON.stringify)", () => {
  const value = { b: 1, a: 2, nested: { d: 3, c: 4 }, arr: [3, 1, 2] };
  const canonical = canonicalizeJson(value);
  assert.equal(
    canonical,
    '{"a":2,"arr":[3,1,2],"b":1,"nested":{"c":4,"d":3}}',
  );
  // Plain stringify preserves insertion order — proves they differ.
  assert.notEqual(canonical, JSON.stringify(value));

  // Number canonicalization (RFC 8785 uses ECMAScript Number-to-String).
  assert.equal(canonicalizeJson({ x: 1.0, y: 100 }), '{"x":1,"y":100}');

  // Array order is preserved by JCS (semantically significant).
  assert.equal(canonicalizeJson([3, 1, 2]), "[3,1,2]");
});

// ── Closed V1 schema: unknown properties fail closed ───────────────────────
test("unknown property at top-level signed package is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey) as unknown as Record<
    string,
    unknown
  >;
  pkg.extra = "nope";
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoveryValidationError,
  );
});

test("unknown property in payload is rejected", () => {
  const p = { ...validPayload(), surprise: 1 } as unknown;
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

test("unknown property in signature is rejected", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  (pkg.signature as unknown as Record<string, unknown>).extra = "nope";
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoveryValidationError,
  );
});

test("unknown property in recommended_import_range is rejected", () => {
  const p = validPayload();
  (p.recommended_import_range as unknown as Record<string, unknown>).step = 1;
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

test("unknown property in wallet_rotation_history entry is rejected", () => {
  const p = validPayload();
  (p.wallet_rotation_history[0] as unknown as Record<string, unknown>).label =
    "x";
  assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
});

// ── Strict canonical UTC timestamps ────────────────────────────────────────
test("canonical UTC generated_at/rotated_at are accepted", () => {
  const p = validPayload();
  p.generated_at = "2026-10-05T12:34:56.789Z";
  p.wallet_rotation_history[0].rotated_at = "2025-01-02T03:04:05.000Z";
  const out = assertValidPayloadV1(p);
  assert.equal(out.generated_at, "2026-10-05T12:34:56.789Z");
});

test("non-canonical / invalid timestamps are rejected", () => {
  for (const bad of [
    "2026-10-05",
    "2026-10-05T12:34:56Z", // missing milliseconds
    "2026-10-05T12:34:56.789+02:00", // timezone offset
    "2026-10-05T12:34:56.789", // no zone (local)
    "2026-13-05T00:00:00.000Z", // invalid month
    "2026-10-05 12:34:56.789Z", // space instead of T
    "not a date",
    "",
  ]) {
    const p = validPayload();
    p.generated_at = bad;
    assert.throws(
      () => assertValidPayloadV1(p),
      RecoveryValidationError,
      `generated_at should reject: ${bad}`,
    );
  }

  const r = validPayload();
  r.wallet_rotation_history[0].rotated_at = "2025-06-01T00:00:00Z";
  assert.throws(() => assertValidPayloadV1(r), RecoveryValidationError);
});

test("round-trip identity holds for accepted timestamps", () => {
  const value = validPayload().generated_at;
  assert.equal(new Date(value).toISOString(), value);
});

// ── Self-contained historical recovery range in rotation entries ───────────
test("rotation entry requires last_allocated_index and recommended_import_range", () => {
  const missingAlloc = validPayload();
  delete (missingAlloc.wallet_rotation_history[0] as unknown as Record<
    string,
    unknown
  >).last_allocated_index;
  assert.throws(
    () => assertValidPayloadV1(missingAlloc),
    RecoveryValidationError,
  );

  const missingRange = validPayload();
  delete (missingRange.wallet_rotation_history[0] as unknown as Record<
    string,
    unknown
  >).recommended_import_range;
  assert.throws(
    () => assertValidPayloadV1(missingRange),
    RecoveryValidationError,
  );
});

test("rotation entry rejects negative/unsafe indices and bad range ordering", () => {
  const neg = validPayload();
  neg.wallet_rotation_history[0].last_allocated_index = -1;
  assert.throws(() => assertValidPayloadV1(neg), RecoveryValidationError);

  const unsafe = validPayload();
  unsafe.wallet_rotation_history[0].last_funded_index =
    Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => assertValidPayloadV1(unsafe), RecoveryValidationError);

  const badRange = validPayload();
  badRange.wallet_rotation_history[0].recommended_import_range = {
    start: 50,
    end: 10,
  };
  assert.throws(() => assertValidPayloadV1(badRange), RecoveryValidationError);
});

test("tampering with rotation recovery range invalidates the signature", () => {
  const { publicKey, privateKey } = newKeyPair();
  const pkg = sign(validPayload(), privateKey);
  pkg.payload.wallet_rotation_history[0].recommended_import_range.end = 999;
  assert.throws(
    () => verifyRecoveryPackage(pkg, resolverFor(publicKey)),
    RecoverySignatureError,
  );

  const pkg2 = sign(validPayload(), privateKey);
  pkg2.payload.wallet_rotation_history[0].last_allocated_index = 123;
  assert.throws(
    () => verifyRecoveryPackage(pkg2, resolverFor(publicKey)),
    RecoverySignatureError,
  );
});

// ── BIP32 non-hardened index bounds (current + historical fields) ──────────
test("MAX_BIP32_NON_HARDENED_INDEX constant is 0x7fffffff", () => {
  assert.equal(MAX_BIP32_NON_HARDENED_INDEX, 0x7fffffff);
});

const OVER = 0x80000000;

test("BIP32 boundaries accepted at 0 and 0x7fffffff for current fields", () => {
  const low = validPayload();
  low.last_allocated_index = 0;
  low.last_funded_index = 0;
  low.recommended_import_range = { start: 0, end: 0 };
  assert.doesNotThrow(() => assertValidPayloadV1(low));

  const high = validPayload();
  high.last_allocated_index = 0x7fffffff;
  high.last_funded_index = 0x7fffffff;
  high.recommended_import_range = { start: 0, end: 0x7fffffff };
  assert.doesNotThrow(() => assertValidPayloadV1(high));
});

test("current BIP32 index fields reject 0x80000000", () => {
  for (const mutate of [
    (p: RecoveryPackagePayloadV1) => (p.last_allocated_index = OVER),
    (p: RecoveryPackagePayloadV1) => (p.last_funded_index = OVER),
    (p: RecoveryPackagePayloadV1) =>
      (p.recommended_import_range = { start: 0, end: OVER }),
    (p: RecoveryPackagePayloadV1) =>
      (p.recommended_import_range = { start: OVER, end: OVER }),
  ]) {
    const p = validPayload();
    mutate(p);
    assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
  }
});

test("historical BIP32 index fields accept 0 and 0x7fffffff, reject 0x80000000", () => {
  const ok = validPayload();
  const e = ok.wallet_rotation_history[0];
  e.last_allocated_index = 0;
  e.last_funded_index = 0x7fffffff;
  e.recommended_import_range = { start: 0, end: 0x7fffffff };
  assert.doesNotThrow(() => assertValidPayloadV1(ok));

  for (const mutate of [
    (p: RecoveryPackagePayloadV1) =>
      (p.wallet_rotation_history[0].last_allocated_index = OVER),
    (p: RecoveryPackagePayloadV1) =>
      (p.wallet_rotation_history[0].last_funded_index = OVER),
    (p: RecoveryPackagePayloadV1) =>
      (p.wallet_rotation_history[0].recommended_import_range = {
        start: 0,
        end: OVER,
      }),
    (p: RecoveryPackagePayloadV1) =>
      (p.wallet_rotation_history[0].recommended_import_range = {
        start: OVER,
        end: OVER,
      }),
  ]) {
    const p = validPayload();
    mutate(p);
    assert.throws(() => assertValidPayloadV1(p), RecoveryValidationError);
  }
});

test("BIP32 index fields reject negative and unsafe integers", () => {
  const neg = validPayload();
  neg.last_allocated_index = -1;
  assert.throws(() => assertValidPayloadV1(neg), RecoveryValidationError);

  const unsafe = validPayload();
  unsafe.recommended_import_range = {
    start: 0,
    end: Number.MAX_SAFE_INTEGER + 1,
  };
  assert.throws(() => assertValidPayloadV1(unsafe), RecoveryValidationError);
});

test("gap_limit must stay within BIP32 non-hardened index space", () => {
  const over = validPayload();
  over.gap_limit = OVER;
  assert.throws(() => assertValidPayloadV1(over), RecoveryValidationError);

  const atMax = validPayload();
  atMax.gap_limit = 0x7fffffff;
  assert.doesNotThrow(() => assertValidPayloadV1(atMax));

  // Wallet version numbers are NOT BIP32 indices and keep generic validation.
  const bigVersion = validPayload();
  bigVersion.wallet_rotation_history[0].version = OVER;
  assert.doesNotThrow(() => assertValidPayloadV1(bigVersion));
});
