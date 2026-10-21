import test from "node:test";
import assert from "node:assert/strict";
import {
  getDescriptorInfo,
  deriveAddress0,
  deriveAddressAtIndex,
  isValidExternalIndex,
  BIP84_EXTERNAL_INDEX_LIMIT,
  getNodeNetwork,
  WalletRpcError,
  WALLET_RPC_ERROR_CODES,
} from "./walletRpc";

// These tests exercise the REAL walletRpc + bitcoinRpc + error-classification
// stack and only stub the HTTP transport (global fetch), so no Bitcoin Core
// node is required. btcRpcCall reads these env vars at call time.
process.env.BTC_RPC_URL ??= "http://127.0.0.1:38332";
process.env.BTC_RPC_USER ??= "test";
process.env.BTC_RPC_PASSWORD ??= "test";
process.env.BTC_RPC_WALLET ??= "test-wallet";

const realFetch = globalThis.fetch;

function restoreFetch(): void {
  globalThis.fetch = realFetch;
}

/** Stub a successful JSON-RPC 200 response carrying `result`. */
function mockRpcResult(result: unknown): void {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ result }),
  })) as unknown as typeof fetch;
}

/** Stub a JSON-RPC 200 response carrying an `error` object (Core-style). */
function mockRpcError(code: number, message: string): void {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ error: { code, message } }),
  })) as unknown as typeof fetch;
}

/** Stub a non-200 HTTP response (btcRpcCall throws BTC_RPC_HTTP_ERROR). */
function mockHttpError(): void {
  globalThis.fetch = (async () => ({
    ok: false,
    json: async () => null,
  })) as unknown as typeof fetch;
}

/** Stub a transport-level rejection (DNS/connection failure). */
function mockTransportReject(): void {
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:38332");
  }) as unknown as typeof fetch;
}

async function expectRpcError(
  fn: () => Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await fn();
    assert.fail(`expected WalletRpcError ${code}, got success`);
  } catch (err) {
    assert.ok(
      err instanceof WalletRpcError,
      `expected WalletRpcError, got ${String(err)}`
    );
    assert.equal((err as WalletRpcError).code, code);
  }
}

const CANONICAL = "wpkh([73c5da0a/84h/0h/0h]xpub6Cat...xyz/0/*)";
const CHECKSUM = "xyz0abcd"; // 8-char placeholder; Core is mocked, value is echoed

// ─── getDescriptorInfo ────────────────────────────────────────────────────────

test("getDescriptorInfo: valid descriptor returns canonical descriptor + checksum", async () => {
  mockRpcResult({
    descriptor: `${CANONICAL}#${CHECKSUM}`,
    checksum: CHECKSUM,
    isrange: true,
    issolvable: true,
    hasprivatekeys: false,
  });
  try {
    const info = await getDescriptorInfo(CANONICAL);
    assert.equal(info.canonicalDescriptor, `${CANONICAL}#${CHECKSUM}`);
    assert.equal(info.checksum, CHECKSUM);
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: an invalid supplied checksum is rejected", async () => {
  mockRpcError(-8, "Provided checksum 'aaaaaaaa' does not match computed checksum");
  try {
    await expectRpcError(
      () => getDescriptorInfo(`${CANONICAL}#aaaaaaaa`),
      WALLET_RPC_ERROR_CODES.CHECKSUM_INVALID
    );
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: hasprivatekeys=true is rejected", async () => {
  mockRpcResult({
    descriptor: `${CANONICAL}#${CHECKSUM}`,
    checksum: CHECKSUM,
    isrange: true,
    issolvable: true,
    hasprivatekeys: true,
  });
  try {
    await expectRpcError(
      () => getDescriptorInfo(CANONICAL),
      WALLET_RPC_ERROR_CODES.PRIVATE_MATERIAL_REJECTED
    );
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: issolvable=false is rejected", async () => {
  mockRpcResult({
    descriptor: `${CANONICAL}#${CHECKSUM}`,
    checksum: CHECKSUM,
    isrange: true,
    issolvable: false,
    hasprivatekeys: false,
  });
  try {
    await expectRpcError(
      () => getDescriptorInfo(CANONICAL),
      WALLET_RPC_ERROR_CODES.INPUT_INVALID
    );
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: malformed Core response (missing fields) fails closed", async () => {
  mockRpcResult({ issolvable: true, hasprivatekeys: false });
  try {
    await expectRpcError(
      () => getDescriptorInfo(CANONICAL),
      WALLET_RPC_ERROR_CODES.INPUT_INVALID
    );
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: descriptor not ending in #checksum fails closed", async () => {
  mockRpcResult({
    descriptor: CANONICAL, // checksum not appended
    checksum: CHECKSUM,
    isrange: true,
    issolvable: true,
    hasprivatekeys: false,
  });
  try {
    await expectRpcError(
      () => getDescriptorInfo(CANONICAL),
      WALLET_RPC_ERROR_CODES.INPUT_INVALID
    );
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: HTTP transport failure maps to NODE_UNAVAILABLE", async () => {
  mockHttpError();
  try {
    await expectRpcError(
      () => getDescriptorInfo(CANONICAL),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

test("getDescriptorInfo: connection rejection maps to NODE_UNAVAILABLE", async () => {
  mockTransportReject();
  try {
    await expectRpcError(
      () => getDescriptorInfo(CANONICAL),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

// ─── deriveAddress0 ───────────────────────────────────────────────────────────

test("deriveAddress0: returns the first derived address", async () => {
  const addr = "tb1qexampleaddress0000000000000000000000000";
  mockRpcResult([addr]);
  try {
    const result = await deriveAddress0(`${CANONICAL}#${CHECKSUM}`);
    assert.equal(result, addr);
  } finally {
    restoreFetch();
  }
});

test("deriveAddress0: empty array fails closed", async () => {
  mockRpcResult([]);
  try {
    await expectRpcError(
      () => deriveAddress0(`${CANONICAL}#${CHECKSUM}`),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

test("deriveAddress0: malformed (non-string) entry fails closed", async () => {
  mockRpcResult([123]);
  try {
    await expectRpcError(
      () => deriveAddress0(`${CANONICAL}#${CHECKSUM}`),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

test("deriveAddress0: RPC error maps to a safe code", async () => {
  mockRpcError(-5, "Invalid descriptor");
  try {
    await expectRpcError(
      () => deriveAddress0(`${CANONICAL}#${CHECKSUM}`),
      WALLET_RPC_ERROR_CODES.INPUT_INVALID
    );
  } finally {
    restoreFetch();
  }
});

// ─── deriveAddressAtIndex ─────────────────────────────────────────────────────

test("deriveAddressAtIndex: derives at index 0", async () => {
  const addr = "tb1qindex0address0000000000000000000000000";
  let captured: unknown[] | undefined;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    captured = JSON.parse(init.body).params;
    return { ok: true, json: async () => ({ result: [addr] }) };
  }) as unknown as typeof fetch;
  try {
    const result = await deriveAddressAtIndex(`${CANONICAL}#${CHECKSUM}`, 0);
    assert.equal(result, addr);
    assert.deepEqual(captured, [`${CANONICAL}#${CHECKSUM}`, [0, 0]]);
  } finally {
    restoreFetch();
  }
});

test("deriveAddressAtIndex: derives at a positive index", async () => {
  const addr = "tb1qindex7address0000000000000000000000000";
  let captured: unknown[] | undefined;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    captured = JSON.parse(init.body).params;
    return { ok: true, json: async () => ({ result: [addr] }) };
  }) as unknown as typeof fetch;
  try {
    const result = await deriveAddressAtIndex(`${CANONICAL}#${CHECKSUM}`, 7);
    assert.equal(result, addr);
    assert.deepEqual(captured, [`${CANONICAL}#${CHECKSUM}`, [7, 7]]);
  } finally {
    restoreFetch();
  }
});

test("deriveAddressAtIndex: rejects negative / fractional / out-of-range / unsafe indices", async () => {
  // No RPC must be issued for a domain-invalid index.
  globalThis.fetch = (async () => {
    throw new Error("fetch must not be called for invalid index");
  }) as unknown as typeof fetch;
  const invalidIndices = [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    BIP84_EXTERNAL_INDEX_LIMIT, // 2^31 is out of range (exclusive upper bound)
    Number.MAX_SAFE_INTEGER,
  ];
  try {
    for (const idx of invalidIndices) {
      await expectRpcError(
        () => deriveAddressAtIndex(`${CANONICAL}#${CHECKSUM}`, idx),
        WALLET_RPC_ERROR_CODES.INPUT_INVALID
      );
    }
  } finally {
    restoreFetch();
  }
});

test("deriveAddressAtIndex: accepts the max valid index 2^31 - 1", async () => {
  const addr = "tb1qmaxindexaddress000000000000000000000000";
  mockRpcResult([addr]);
  try {
    const result = await deriveAddressAtIndex(
      `${CANONICAL}#${CHECKSUM}`,
      BIP84_EXTERNAL_INDEX_LIMIT - 1
    );
    assert.equal(result, addr);
  } finally {
    restoreFetch();
  }
});

test("deriveAddressAtIndex: malformed response (wrong length) fails closed", async () => {
  mockRpcResult(["a", "b"]); // a single-element [i,i] range must yield exactly one
  try {
    await expectRpcError(
      () => deriveAddressAtIndex(`${CANONICAL}#${CHECKSUM}`, 3),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

test("deriveAddressAtIndex: empty array fails closed", async () => {
  mockRpcResult([]);
  try {
    await expectRpcError(
      () => deriveAddressAtIndex(`${CANONICAL}#${CHECKSUM}`, 3),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

test("deriveAddressAtIndex: RPC error maps to a safe code", async () => {
  mockRpcError(-5, "Invalid descriptor");
  try {
    await expectRpcError(
      () => deriveAddressAtIndex(`${CANONICAL}#${CHECKSUM}`, 3),
      WALLET_RPC_ERROR_CODES.INPUT_INVALID
    );
  } finally {
    restoreFetch();
  }
});

test("isValidExternalIndex: domain boundaries", () => {
  assert.equal(isValidExternalIndex(0), true);
  assert.equal(isValidExternalIndex(1), true);
  assert.equal(isValidExternalIndex(BIP84_EXTERNAL_INDEX_LIMIT - 1), true);
  assert.equal(isValidExternalIndex(-1), false);
  assert.equal(isValidExternalIndex(1.5), false);
  assert.equal(isValidExternalIndex(BIP84_EXTERNAL_INDEX_LIMIT), false);
  assert.equal(isValidExternalIndex(Number.NaN), false);
});

// ─── getNodeNetwork ───────────────────────────────────────────────────────────

test("getNodeNetwork: maps supported Core chain values", async () => {
  const cases: Array<[string, string]> = [
    ["main", "MAINNET"],
    ["test", "TESTNET"],
    ["signet", "SIGNET"],
    ["regtest", "REGTEST"],
  ];
  for (const [chain, expected] of cases) {
    mockRpcResult({ chain });
    try {
      const network = await getNodeNetwork();
      assert.equal(network, expected);
    } finally {
      restoreFetch();
    }
  }
});

test("getNodeNetwork: unknown chain fails closed", async () => {
  mockRpcResult({ chain: "bogus" });
  try {
    await expectRpcError(
      () => getNodeNetwork(),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});

test("getNodeNetwork: transport failure fails closed", async () => {
  mockTransportReject();
  try {
    await expectRpcError(
      () => getNodeNetwork(),
      WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE
    );
  } finally {
    restoreFetch();
  }
});
