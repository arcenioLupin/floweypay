# @floweypay/recovery

Signed, **watch-only** FloweyPay Recovery Package domain primitive.

This package produces and verifies a JSON snapshot that lets a merchant (or an
auditor) re-identify and re-import FloweyPay-managed **public** wallet
descriptors into any standard Bitcoin tool, even if FloweyPay no longer exists.

## Purpose

- Serialize a watch-only recovery snapshot as a strongly-typed
  `RecoveryPackagePayloadV1`.
- Sign it with **Ed25519** over the **RFC 8785 (JCS)** canonical bytes.
- Verify it **offline**, deterministically, against a caller-supplied trusted
  public key resolved by `key_id`.

## Security boundary

This package is intentionally isolated. It does **not** depend on Prisma,
PostgreSQL, Bitcoin Core/RPC, Next.js, the worker, or any FloweyPay service. The
payload is **supplied by the caller**; this package never queries a database or
derives Bitcoin addresses.

- No seed, `xprv`/`tprv`, WIF, or spending material is ever part of a package.
  Untrusted input containing such fields is **rejected**, not stripped.
- Private signing keys are supplied by the caller and are **never** persisted,
  logged, or embedded by this package.
- Package contents, descriptors, signatures, and key material are **never**
  logged; error messages are generic.

## What the signature guarantees

- **Authenticity**: the payload was signed by the holder of the private key
  identified by `key_id`.
- **Integrity**: the exact canonical payload bytes have not been altered.
  Any change — including to `descriptor`, index state, or
  `wallet_rotation_history` — invalidates the signature.

## What it does NOT guarantee

- It does **not** prove the data is semantically correct against any live
  wallet state (no chain/DB is consulted).
- It does **not** grant spending ability. **A Recovery Package can never move
  funds; the merchant seed / private keys are still required to spend.**
- It does **not** establish its own trust root. A verification key embedded in
  the package is never trusted — trust comes solely from the caller's resolver.

## Private key handling

- The signing key is a FloweyPay **document-authenticity** key, not a Bitcoin
  wallet/spending key.
- Provide signing material as a Node `KeyObject` (via `createKeyObjectSigner`)
  or your own `RecoverySigner` backed by an HSM/KMS. The caller owns the key
  lifecycle.

## Offline verification

`verifyRecoveryPackage(pkg, resolver)` performs pure in-memory validation and
Ed25519 verification. It requires no network, database, Bitcoin Core, or
FloweyPay service, and is deterministic.

## key_id rotation

Signing keys rotate via `key_id`. The verifier resolves the trusted public key
for a package's `key_id`; retiring or adding keys never requires a
`schema_version` change.

## Descriptor privacy warning

An output descriptor reveals **all** past and future addresses for a wallet.
Treat Recovery Packages as sensitive: anyone with the package can monitor the
merchant's on-chain activity (but cannot spend).

## Recovery Package ≠ seed backup

A Recovery Package is a watch-only convenience for re-importing public
descriptors. **It does not replace the merchant's seed backup** and cannot be
used to recover spending authority.

## Usage

```ts
import {
  signRecoveryPackage,
  createKeyObjectSigner,
  verifyRecoveryPackage,
  createTrustedKeyResolver,
} from "@floweypay/recovery";
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const signed = signRecoveryPackage(
  payload, // caller-supplied RecoveryPackagePayloadV1
  createKeyObjectSigner("floweypay-doc-2026-01", privateKey),
);

const resolver = createTrustedKeyResolver({
  "floweypay-doc-2026-01": publicKey,
});
const verified = verifyRecoveryPackage(signed, resolver);
```
