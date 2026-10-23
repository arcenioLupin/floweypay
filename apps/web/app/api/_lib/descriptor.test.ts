import test from "node:test";
import assert from "node:assert/strict";
import {
  DescriptorError,
  WALLET_ERROR_CODES,
  normalizeOnboardingInput,
  chainToNetwork,
} from "./descriptor";

// BIP84 official test vector (mnemonic "abandon abandon ... about"):
//   master fingerprint = 73c5da0a, account m/84'/0'/0'.
const FP = "73c5da0a";
const XPUB =
  "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V";
const ZPUB =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";

const FULL_DESCRIPTOR = `wpkh([${FP}/84h/0h/0h]${XPUB}/0/*)`;

function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
    assert.fail(`expected DescriptorError ${code}, got success`);
  } catch (err) {
    assert.ok(err instanceof DescriptorError, `expected DescriptorError, got ${err}`);
    assert.equal((err as DescriptorError).code, code);
  }
}

// ─── Happy paths ──────────────────────────────────────────────────────────────

test("normalize: full wpkh descriptor is accepted and metadata extracted", () => {
  const r = normalizeOnboardingInput({
    walletMaterial: FULL_DESCRIPTOR,
    network: "MAINNET",
  });
  assert.equal(r.masterFingerprint, FP);
  assert.equal(r.derivationPath, "m/84'/0'/0'/0/*");
  assert.equal(r.account, 0);
  assert.equal(r.coinType, 0);
  assert.equal(r.scriptType, "P2WPKH");
  // The exact merchant input is preserved for Core checksum validation.
  assert.equal(r.descriptorForValidation, FULL_DESCRIPTOR);
  assert.equal(r.descriptorBody, FULL_DESCRIPTOR);
});

test("normalize: a supplied checksum is captured and the body preserved", () => {
  const r = normalizeOnboardingInput({
    walletMaterial: `${FULL_DESCRIPTOR}#qpzry9x8`,
    network: "MAINNET",
  });
  assert.equal(r.suppliedChecksum, "qpzry9x8");
  assert.equal(r.descriptorForValidation, `${FULL_DESCRIPTOR}#qpzry9x8`);
});

test("normalize: bare ZPUB (with fingerprint+account) matches the XPUB descriptor", () => {
  const bare = normalizeOnboardingInput({
    walletMaterial: ZPUB,
    network: "MAINNET",
    masterFingerprint: FP,
    account: 0,
  });
  // ZPUB must normalize to the equivalent XPUB descriptor body (no fabrication).
  assert.equal(bare.descriptorBody, FULL_DESCRIPTOR);
  assert.equal(bare.masterFingerprint, FP);
  assert.equal(bare.derivationPath, "m/84'/0'/0'/0/*");
});

test("chainToNetwork maps Core chain strings", () => {
  assert.equal(chainToNetwork("main"), "MAINNET");
  assert.equal(chainToNetwork("test"), "TESTNET");
  assert.equal(chainToNetwork("signet"), "SIGNET");
  assert.equal(chainToNetwork("regtest"), "REGTEST");
  assert.equal(chainToNetwork("bogus"), null);
});

// ─── Rejections ───────────────────────────────────────────────────────────────

test("reject: private xprv material", () => {
  expectError(
    () => normalizeOnboardingInput({ walletMaterial: "xprv9s21ZrFAKEPRIVKEY", network: "MAINNET" }),
    WALLET_ERROR_CODES.PRIVATE_MATERIAL_REJECTED
  );
});

test("reject: BIP39 mnemonic phrase", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial:
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        network: "MAINNET",
      }),
    WALLET_ERROR_CODES.PRIVATE_MATERIAL_REJECTED
  );
});

test("reject: unsupported script function (pkh)", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: `pkh([${FP}/44h/0h/0h]${XPUB}/0/*)`,
        network: "MAINNET",
      }),
    WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT
  );
});

test("reject: nested wrapped-segwit (sh(wpkh(...)))", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: `sh(wpkh([${FP}/49h/0h/0h]${XPUB}/0/*))`,
        network: "MAINNET",
      }),
    WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT
  );
});

test("reject: change chain /1/* is unsupported", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: `wpkh([${FP}/84h/0h/0h]${XPUB}/1/*)`,
        network: "MAINNET",
      }),
    WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT
  );
});

test("reject: malformed checksum format", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: `${FULL_DESCRIPTOR}#zzz`,
        network: "MAINNET",
      }),
    WALLET_ERROR_CODES.CHECKSUM_INVALID
  );
});

test("reject: network mismatch (mainnet key, testnet requested)", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: FULL_DESCRIPTOR,
        network: "TESTNET",
      }),
    WALLET_ERROR_CODES.NETWORK_MISMATCH
  );
});

test("reject: bare key without fingerprint+account", () => {
  expectError(
    () => normalizeOnboardingInput({ walletMaterial: ZPUB, network: "MAINNET" }),
    WALLET_ERROR_CODES.KEY_ORIGIN_REQUIRED
  );
});

test("reject: full descriptor without key origin", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: `wpkh(${XPUB}/0/*)`,
        network: "MAINNET",
      }),
    WALLET_ERROR_CODES.KEY_ORIGIN_REQUIRED
  );
});

test("reject: invalid base58 extended key", () => {
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: "xpub0000invalid0000",
        network: "MAINNET",
        masterFingerprint: FP,
        account: 0,
      }),
    WALLET_ERROR_CODES.INPUT_INVALID
  );
});

test("reject: account mismatch between declared account and key metadata", () => {
  // The key is an account-0 key; declaring account 5 must be rejected.
  expectError(
    () =>
      normalizeOnboardingInput({
        walletMaterial: ZPUB,
        network: "MAINNET",
        masterFingerprint: FP,
        account: 5,
      }),
    WALLET_ERROR_CODES.INPUT_INVALID
  );
});

test("reject: empty wallet material", () => {
  expectError(
    () => normalizeOnboardingInput({ walletMaterial: "   ", network: "MAINNET" }),
    WALLET_ERROR_CODES.INPUT_INVALID
  );
});
