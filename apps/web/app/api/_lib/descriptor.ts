import crypto from "crypto";

/**
 * API-001 — Pure BIP84 descriptor parsing & normalization (no network I/O).
 *
 * Produces a canonical P2WPKH receive-chain descriptor body ready for Bitcoin
 * Core `getdescriptorinfo` validation. Never fabricates key-origin metadata and
 * never accepts private signing material. All functions here are deterministic
 * and independently unit-testable.
 */

export type BtcNet = "MAINNET" | "TESTNET" | "SIGNET" | "REGTEST";

export const WALLET_ERROR_CODES = {
  INPUT_INVALID: "WALLET_INPUT_INVALID",
  PRIVATE_MATERIAL_REJECTED: "WALLET_PRIVATE_MATERIAL_REJECTED",
  UNSUPPORTED_SCRIPT: "WALLET_UNSUPPORTED_SCRIPT",
  CHECKSUM_INVALID: "WALLET_CHECKSUM_INVALID",
  NETWORK_MISMATCH: "WALLET_NETWORK_MISMATCH",
  KEY_ORIGIN_REQUIRED: "WALLET_KEY_ORIGIN_REQUIRED",
} as const;

export type WalletErrorCode =
  (typeof WALLET_ERROR_CODES)[keyof typeof WALLET_ERROR_CODES];

/** Carries a safe, non-leaking error code. Never embeds raw wallet material. */
export class DescriptorError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode) {
    super(code);
    this.code = code;
    this.name = "DescriptorError";
  }
}

export interface OnboardingInput {
  walletMaterial: string;
  network: BtcNet;
  /** Required only for bare XPUB/ZPUB inputs. */
  masterFingerprint?: string;
  /** Required only for bare XPUB/ZPUB inputs (BIP84 account index). */
  account?: number;
}

export interface NormalizedDescriptor {
  /** Descriptor expression WITHOUT checksum, for getdescriptorinfo. */
  descriptorBody: string;
  /**
   * Exact string to hand to Bitcoin Core for authoritative validation. For a
   * full descriptor this is the merchant's original input (including any
   * supplied checksum, so Core validates it before canonicalization). For a
   * bare XPUB/ZPUB it is the rebuilt body (Core appends the checksum).
   */
  descriptorForValidation: string;
  /** Checksum supplied by the merchant on a full descriptor, else null. */
  suppliedChecksum: string | null;
  masterFingerprint: string;
  derivationPath: string;
  account: number;
  coinType: 0 | 1;
  network: BtcNet;
  scriptType: "P2WPKH";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HARDENED = 0x80000000;
const MAX_INDEX = 0x7fffffff; // 2^31 - 1

// Extended public key version bytes.
const VERSION = {
  xpub: 0x0488b21e, // BIP44 mainnet pub
  tpub: 0x043587cf, // BIP44 testnet pub
  zpub: 0x04b24746, // BIP84 mainnet pub
  vpub: 0x045f1cf6, // BIP84 testnet pub
  ypub: 0x049d7cb2, // BIP49 mainnet pub (wrapped segwit) — rejected
  upub: 0x044a5262, // BIP49 testnet pub (wrapped segwit) — rejected
} as const;

// Checksum charset used by Bitcoin Core descriptor checksums.
const CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Markers that indicate private signing material — rejected outright.
const PRIVATE_MARKERS = /(xprv|yprv|zprv|tprv|uprv|vprv)/i;

// Descriptor functions other than wpkh are unsupported in the MVP.
const UNSUPPORTED_FUNCS = [
  "pkh(",
  "sh(",
  "wsh(",
  "tr(",
  "combo(",
  "multi(",
  "sortedmulti(",
  "addr(",
  "raw(",
  "rawtr(",
  "pk(",
];

// ─── base58check ──────────────────────────────────────────────────────────────

function decodeBase58(input: string): Buffer {
  let bytes: number[] = [0];
  for (const ch of input) {
    const value = BASE58_ALPHABET.indexOf(ch);
    if (value === -1) throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Preserve leading zeros (each leading '1' => a 0x00 byte).
  for (let k = 0; k < input.length && input[k] === "1"; k++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

function encodeBase58(buffer: Buffer): string {
  const digits: number[] = [0];
  for (const byte of buffer) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (let k = 0; k < buffer.length && buffer[k] === 0; k++) out += "1";
  for (let q = digits.length - 1; q >= 0; q--) out += BASE58_ALPHABET[digits[q]];
  return out;
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function decodeBase58Check(input: string): Buffer {
  const full = decodeBase58(input);
  if (full.length < 5) throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  const payload = full.subarray(0, full.length - 4);
  const checksum = full.subarray(full.length - 4);
  const expected = sha256(sha256(payload)).subarray(0, 4);
  if (!checksum.equals(expected)) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  return payload;
}

function encodeBase58Check(payload: Buffer): string {
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return encodeBase58(Buffer.concat([payload, checksum]));
}

// ─── Extended key parsing ─────────────────────────────────────────────────────

interface ParsedXpub {
  /** Normalized to xpub (mainnet) / tpub (testnet-family) form. */
  canonicalXpub: string;
  version: number;
  depth: number;
  childNumber: number;
  isMainnet: boolean;
}

function expectedCoinType(network: BtcNet): 0 | 1 {
  return network === "MAINNET" ? 0 : 1;
}

function networkIsMainnet(network: BtcNet): boolean {
  return network === "MAINNET";
}

/**
 * Parse + structurally validate an extended public key. ZPUB/VPUB are converted
 * to their XPUB/TPUB equivalents so the resulting descriptor is Core-canonical.
 * Rejects private keys and wrapped-segwit (ypub/upub) versions.
 */
function parseExtendedPublicKey(key: string, network: BtcNet): ParsedXpub {
  if (PRIVATE_MARKERS.test(key)) {
    throw new DescriptorError(WALLET_ERROR_CODES.PRIVATE_MATERIAL_REJECTED);
  }

  const payload = decodeBase58Check(key);
  if (payload.length !== 78) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }

  const version = payload.readUInt32BE(0);
  const depth = payload.readUInt8(4);
  const childNumber = payload.readUInt32BE(9);

  if (version === VERSION.ypub || version === VERSION.upub) {
    // BIP49 wrapped segwit is explicitly unsupported.
    throw new DescriptorError(WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT);
  }

  let isMainnet: boolean;
  let canonicalVersion: number;
  switch (version) {
    case VERSION.xpub:
      isMainnet = true;
      canonicalVersion = VERSION.xpub;
      break;
    case VERSION.zpub:
      isMainnet = true;
      canonicalVersion = VERSION.xpub; // normalize zpub -> xpub
      break;
    case VERSION.tpub:
      isMainnet = false;
      canonicalVersion = VERSION.tpub;
      break;
    case VERSION.vpub:
      isMainnet = false;
      canonicalVersion = VERSION.tpub; // normalize vpub -> tpub
      break;
    default:
      throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }

  if (isMainnet !== networkIsMainnet(network)) {
    throw new DescriptorError(WALLET_ERROR_CODES.NETWORK_MISMATCH);
  }

  // Re-encode with the canonical (non-zpub/vpub) version bytes if needed.
  let canonicalXpub = key;
  if (canonicalVersion !== version) {
    const rewritten = Buffer.from(payload);
    rewritten.writeUInt32BE(canonicalVersion, 0);
    canonicalXpub = encodeBase58Check(rewritten);
  }

  return { canonicalXpub, version, depth, childNumber, isMainnet };
}

function assertAccountLevelKey(parsed: ParsedXpub, account: number): void {
  // A BIP84 account-level key sits at depth 3 (m/84'/coin'/account').
  if (parsed.depth !== 3) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  // Its own child number must equal the hardened account index — cross-checks
  // the declared account against the key's embedded metadata (no fabrication).
  if (parsed.childNumber !== (HARDENED + account) >>> 0) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function assertNoPrivateMaterial(raw: string): void {
  if (PRIVATE_MARKERS.test(raw)) {
    throw new DescriptorError(WALLET_ERROR_CODES.PRIVATE_MATERIAL_REJECTED);
  }
  // Heuristic mnemonic detection: many lowercase words separated by spaces.
  const words = raw.trim().split(/\s+/);
  if (words.length >= 12 && words.every((w) => /^[a-z]+$/.test(w))) {
    throw new DescriptorError(WALLET_ERROR_CODES.PRIVATE_MATERIAL_REJECTED);
  }
}

function validateFingerprint(fp: string): string {
  if (!/^[0-9a-fA-F]{8}$/.test(fp)) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  return fp.toLowerCase();
}

function validateAccount(account: number): number {
  if (!Number.isInteger(account) || account < 0 || account > MAX_INDEX) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  return account;
}

/** Parse a hardened path element like "84h" or "84'" into its numeric index. */
function parseHardenedElement(el: string): number {
  const m = /^(\d+)(['h])$/.exec(el);
  if (!m) throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 0 || n > MAX_INDEX) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  return n;
}

function validateChecksumFormat(cs: string): string {
  if (cs.length !== 8) throw new DescriptorError(WALLET_ERROR_CODES.CHECKSUM_INVALID);
  for (const ch of cs) {
    if (!CHECKSUM_CHARSET.includes(ch)) {
      throw new DescriptorError(WALLET_ERROR_CODES.CHECKSUM_INVALID);
    }
  }
  return cs;
}

// ─── Descriptor-input path ────────────────────────────────────────────────────

function normalizeDescriptorInput(
  raw: string,
  network: BtcNet
): NormalizedDescriptor {
  // Split optional checksum.
  let body = raw;
  let suppliedChecksum: string | null = null;
  const hashIdx = raw.indexOf("#");
  if (hashIdx !== -1) {
    body = raw.slice(0, hashIdx);
    suppliedChecksum = validateChecksumFormat(raw.slice(hashIdx + 1));
  }

  const lower = body.toLowerCase();
  if (!lower.startsWith("wpkh(")) {
    for (const fn of UNSUPPORTED_FUNCS) {
      if (lower.startsWith(fn) || lower.includes(fn)) {
        throw new DescriptorError(WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT);
      }
    }
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }

  if (!body.endsWith(")")) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  const inner = body.slice("wpkh(".length, -1);

  // A plain wpkh() key expression contains no further parentheses. Any nested
  // script function (e.g. wpkh(sortedmulti(...))) is unsupported.
  if (inner.includes("(") || inner.includes(")")) {
    throw new DescriptorError(WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT);
  }

  // Key origin is mandatory for a full descriptor (gives us the fingerprint).
  if (!inner.startsWith("[")) {
    throw new DescriptorError(WALLET_ERROR_CODES.KEY_ORIGIN_REQUIRED);
  }
  const close = inner.indexOf("]");
  if (close === -1) throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);

  const originStr = inner.slice(1, close);
  const keyPart = inner.slice(close + 1);

  const originPieces = originStr.split("/");
  if (originPieces.length !== 4) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  const masterFingerprint = validateFingerprint(originPieces[0]);
  const purpose = parseHardenedElement(originPieces[1]);
  const coinType = parseHardenedElement(originPieces[2]);
  const account = validateAccount(parseHardenedElement(originPieces[3]));

  if (purpose !== 84) {
    throw new DescriptorError(WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT);
  }
  if (coinType !== expectedCoinType(network)) {
    throw new DescriptorError(WALLET_ERROR_CODES.NETWORK_MISMATCH);
  }

  // keyPart must be "<xpub>/0/*" — external receive chain only.
  const slash = keyPart.indexOf("/");
  if (slash === -1) throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  const xpub = keyPart.slice(0, slash);
  const chain = keyPart.slice(slash);
  if (chain !== "/0/*") {
    // Blocks change chain (/1/*), hardened wildcard, and multipath descriptors.
    throw new DescriptorError(WALLET_ERROR_CODES.UNSUPPORTED_SCRIPT);
  }

  const parsed = parseExtendedPublicKey(xpub, network);
  assertAccountLevelKey(parsed, account);

  const descriptorBody = `wpkh([${masterFingerprint}/84h/${coinType}h/${account}h]${parsed.canonicalXpub}/0/*)`;
  return {
    descriptorBody,
    // Preserve the merchant's exact input so Core validates their checksum.
    descriptorForValidation: raw,
    suppliedChecksum,
    masterFingerprint,
    derivationPath: `m/84'/${coinType}'/${account}'/0/*`,
    account,
    coinType: coinType as 0 | 1,
    network,
    scriptType: "P2WPKH",
  };
}

// ─── XPUB/ZPUB-input path ─────────────────────────────────────────────────────

function normalizeBareKeyInput(
  raw: string,
  network: BtcNet,
  masterFingerprint: string | undefined,
  account: number | undefined
): NormalizedDescriptor {
  // Bare keys carry no key origin: the merchant MUST supply fingerprint+account.
  if (
    masterFingerprint === undefined ||
    masterFingerprint === "" ||
    account === undefined
  ) {
    throw new DescriptorError(WALLET_ERROR_CODES.KEY_ORIGIN_REQUIRED);
  }
  const fp = validateFingerprint(masterFingerprint);
  const acct = validateAccount(account);
  const coinType = expectedCoinType(network);

  const parsed = parseExtendedPublicKey(raw, network);
  assertAccountLevelKey(parsed, acct);

  const descriptorBody = `wpkh([${fp}/84h/${coinType}h/${acct}h]${parsed.canonicalXpub}/0/*)`;
  return {
    descriptorBody,
    descriptorForValidation: descriptorBody,
    suppliedChecksum: null,
    masterFingerprint: fp,
    derivationPath: `m/84'/${coinType}'/${acct}'/0/*`,
    account: acct,
    coinType,
    network,
    scriptType: "P2WPKH",
  };
}

// ─── Public entrypoint ────────────────────────────────────────────────────────

const EXT_KEY_PREFIX = /^(xpub|tpub|zpub|vpub|ypub|upub)/;

export function normalizeOnboardingInput(
  input: OnboardingInput
): NormalizedDescriptor {
  const raw = (input.walletMaterial ?? "").trim();
  if (raw.length === 0) {
    throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
  }
  assertNoPrivateMaterial(raw);

  if (raw.includes("(") || raw.toLowerCase().startsWith("wpkh")) {
    return normalizeDescriptorInput(raw, input.network);
  }
  if (EXT_KEY_PREFIX.test(raw)) {
    return normalizeBareKeyInput(
      raw,
      input.network,
      input.masterFingerprint,
      input.account
    );
  }
  throw new DescriptorError(WALLET_ERROR_CODES.INPUT_INVALID);
}

/** Map a Bitcoin Core `getblockchaininfo.chain` value to our network enum. */
export function chainToNetwork(chain: string): BtcNet | null {
  switch (chain) {
    case "main":
      return "MAINNET";
    case "test":
      return "TESTNET";
    case "signet":
      return "SIGNET";
    case "regtest":
      return "REGTEST";
    default:
      return null;
  }
}
