import test from "node:test";
import assert from "node:assert/strict";
import {
  GET,
  handleWalletConfig,
  buildWalletConfigData,
  type WalletConfigDeps,
  type WalletConfigRow,
  type WalletVersionRow,
} from "./route";

// ── Pure, DB-free tests. The handler takes injectable deps, so every persisted
// state can be exercised deterministically without a live database, Bitcoin
// Core, or HWM. requireUserId()/Prisma are only reached via the real GET()
// wiring test below. ──────────────────────────────────────────────────────────

const MERCHANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WALLET_ID = "11111111-1111-1111-1111-111111111111";

function makeVersion(
  overrides: Partial<WalletVersionRow> = {}
): WalletVersionRow {
  return {
    version: 1,
    network: "TESTNET" as WalletVersionRow["network"],
    script_type: "P2WPKH" as WalletVersionRow["script_type"],
    lifecycle: "ACTIVE" as WalletVersionRow["lifecycle"],
    recovery_state: {
      recovery_state: "RECOVERY_REQUIRED" as never,
    },
    monitoring: { monitoring_status: "PENDING" as never },
    ...overrides,
  };
}

function makeRow(versions: WalletVersionRow[]): WalletConfigRow {
  return { id: WALLET_ID, versions };
}

function deps(
  over: Partial<WalletConfigDeps> & { row?: WalletConfigRow | null }
): WalletConfigDeps {
  return {
    getMerchantId: over.getMerchantId ?? (async () => MERCHANT_A),
    loadWalletConfigRow:
      over.loadWalletConfigRow ?? (async () => over.row ?? null),
  };
}

function assertNoStore(res: Response): void {
  const cc = res.headers.get("cache-control") ?? "";
  assert.ok(cc.includes("no-store"), `expected no-store, got "${cc}"`);
}

// 1. Unauthenticated → 401 (safe UNAUTHORIZED, no-store).
test("401 when session is missing/invalid", async () => {
  const res = await handleWalletConfig(
    deps({
      getMerchantId: async () => {
        throw new Error("UNAUTHORIZED");
      },
    })
  );
  assert.equal(res.status, 401);
  const json = (await res.json()) as { success: boolean; message: string };
  assert.equal(json.success, false);
  assert.equal(json.message, "UNAUTHORIZED");
  assertNoStore(res);
});

// 2. No wallet → configured:false.
test("merchant without a wallet returns configured:false", async () => {
  const res = await handleWalletConfig(deps({ row: null }));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { success: boolean; data: unknown };
  assert.equal(json.success, true);
  assert.deepEqual(json.data, { configured: false });
  assertNoStore(res);
});

// 3. ACTIVE + RECOVERY_REQUIRED → walletReady:false.
test("ACTIVE + RECOVERY_REQUIRED → walletReady:false", async () => {
  const res = await handleWalletConfig(
    deps({
      row: makeRow([
        makeVersion({
          recovery_state: { recovery_state: "RECOVERY_REQUIRED" as never },
          monitoring: { monitoring_status: "PENDING" as never },
        }),
      ]),
    })
  );
  assert.equal(res.status, 200);
  const json = (await res.json()) as {
    data: {
      configured: boolean;
      walletId: string;
      activeVersion: { version: number; network: string; scriptType: string; lifecycle: string } | null;
      status: { recoveryState: string; monitoringStatus: string; walletReady: boolean };
    };
  };
  assert.equal(json.data.configured, true);
  assert.equal(json.data.walletId, WALLET_ID);
  assert.deepEqual(json.data.activeVersion, {
    version: 1,
    network: "TESTNET",
    scriptType: "P2WPKH",
    lifecycle: "ACTIVE",
  });
  assert.equal(json.data.status.recoveryState, "RECOVERY_REQUIRED");
  assert.equal(json.data.status.monitoringStatus, "PENDING");
  assert.equal(json.data.status.walletReady, false);
});

// 4. ACTIVE + READY → walletReady:true (persisted eligibility only).
test("ACTIVE + READY → walletReady:true (persisted eligibility, not runtime)", async () => {
  const res = await handleWalletConfig(
    deps({
      row: makeRow([
        makeVersion({
          recovery_state: { recovery_state: "READY" as never },
          monitoring: { monitoring_status: "VERIFIED" as never },
        }),
      ]),
    })
  );
  const json = (await res.json()) as {
    data: { status: { recoveryState: string; walletReady: boolean } };
  };
  assert.equal(json.data.status.recoveryState, "READY");
  assert.equal(json.data.status.walletReady, true);
});

// 5. RETIRED / no ACTIVE version → activeVersion:null, walletReady:false.
test("no ACTIVE version (only RETIRED) → activeVersion:null, walletReady:false", async () => {
  const res = await handleWalletConfig(
    deps({
      row: makeRow([
        makeVersion({
          lifecycle: "RETIRED" as never,
          recovery_state: { recovery_state: "READY" as never },
        }),
      ]),
    })
  );
  const json = (await res.json()) as {
    data: { configured: boolean; activeVersion: unknown; status: { walletReady: boolean } };
  };
  assert.equal(json.data.configured, true);
  assert.equal(json.data.activeVersion, null);
  assert.equal(json.data.status.walletReady, false);
});

// 6. Missing recovery-state record → walletReady:false (never synthesize READY).
test("missing recovery-state record → walletReady:false", async () => {
  const res = await handleWalletConfig(
    deps({
      row: makeRow([
        makeVersion({
          recovery_state: null,
          monitoring: { monitoring_status: "VERIFIED" as never },
        }),
      ]),
    })
  );
  const json = (await res.json()) as {
    data: { status: { recoveryState: string | null; walletReady: boolean } };
  };
  assert.equal(json.data.status.recoveryState, null);
  assert.equal(json.data.status.walletReady, false);
});

// 7. Missing monitoring record → monitoringStatus:null, never VERIFIED.
test("missing monitoring record → monitoringStatus:null (never VERIFIED)", async () => {
  const res = await handleWalletConfig(
    deps({
      row: makeRow([
        makeVersion({
          recovery_state: { recovery_state: "READY" as never },
          monitoring: null,
        }),
      ]),
    })
  );
  const json = (await res.json()) as {
    data: { status: { monitoringStatus: string | null } };
  };
  assert.equal(json.data.status.monitoringStatus, null);
  assert.notEqual(json.data.status.monitoringStatus, "VERIFIED");
});

// 8. Cross-merchant isolation: load is scoped to the authenticated merchant id.
test("query is scoped to the authenticated merchant id", async () => {
  let seenMerchantId: string | null = null;
  const res = await handleWalletConfig({
    getMerchantId: async () => MERCHANT_A,
    loadWalletConfigRow: async (merchantId) => {
      seenMerchantId = merchantId;
      return null;
    },
  });
  assert.equal(res.status, 200);
  assert.equal(seenMerchantId, MERCHANT_A);
});

// 9. DB/internal failure → generic 500, no detail leak.
test("database error → generic 500 without leaking details", async () => {
  const secret = "connection refused: postgres://user:p4ss@10.0.0.5:5432/db";
  const res = await handleWalletConfig({
    getMerchantId: async () => MERCHANT_A,
    loadWalletConfigRow: async () => {
      throw new Error(secret);
    },
  });
  assert.equal(res.status, 500);
  const text = await res.text();
  const json = JSON.parse(text) as { success: boolean; message: string };
  assert.equal(json.success, false);
  assert.equal(json.message, "INTERNAL_ERROR");
  assert.ok(!text.includes("postgres"), "must not leak connection details");
  assert.ok(!text.includes("p4ss"), "must not leak credentials");
  assertNoStore(res);
});

// 10. Sensitive fields never appear, even if present on the source row.
test("sensitive descriptor material never appears in the response", async () => {
  const dirtyVersion = {
    ...makeVersion({ recovery_state: { recovery_state: "READY" as never } }),
    // Simulated sensitive fields that must NOT be echoed.
    descriptor: "wpkh([abcd1234/84h/1h/0h]vpub5Secret.../0/*)#chk5sum0",
    descriptor_checksum: "chk5sum0",
    master_fingerprint: "abcd1234",
    derivation_path: "m/84'/1'/0'",
    monitored_through_index: 42,
    lock_version: 7,
    last_error: "internal monitoring boom",
  } as unknown as WalletVersionRow;

  const res = await handleWalletConfig(deps({ row: makeRow([dirtyVersion]) }));
  const text = await res.text();

  for (const forbidden of [
    "descriptor",
    "vpub",
    "xpub",
    "zpub",
    "chk5sum0",
    "abcd1234",
    "m/84",
    "monitored_through_index",
    "lock_version",
    "last_error",
    "internal monitoring boom",
  ]) {
    assert.ok(
      !text.includes(forbidden),
      `response must not contain "${forbidden}"`
    );
  }
});

// 11. No-store cache protection on a success response.
test("success response carries no-store cache headers", async () => {
  const res = await handleWalletConfig(deps({ row: null }));
  assertNoStore(res);
  assert.equal(res.headers.get("pragma"), "no-cache");
});

// 12. Multiple ACTIVE versions → fail closed, never pick an arbitrary ready one.
test("multiple ACTIVE versions → activeVersion:null, walletReady:false", async () => {
  const res = await handleWalletConfig(
    deps({
      row: makeRow([
        makeVersion({
          version: 1,
          recovery_state: { recovery_state: "READY" as never },
        }),
        makeVersion({
          version: 2,
          recovery_state: { recovery_state: "RECOVERY_REQUIRED" as never },
        }),
      ]),
    })
  );
  const json = (await res.json()) as {
    data: {
      configured: boolean;
      activeVersion: unknown;
      status: { recoveryState: string | null; walletReady: boolean };
    };
  };
  assert.equal(json.data.configured, true);
  assert.equal(json.data.activeVersion, null);
  assert.equal(json.data.status.recoveryState, null);
  assert.equal(json.data.status.walletReady, false);
});

// Pure builder sanity: null row → configured:false.
test("buildWalletConfigData(null) → configured:false", () => {
  assert.deepEqual(buildWalletConfigData(null), { configured: false });
});

// Real GET() wiring: outside a request scope requireUserId() fails; the route
// must still return a safe, generic JSON error with no-store headers and never
// leak the underlying exception text.
test("real GET() returns a safe, non-leaking error with no-store headers", async () => {
  const res = await GET();
  assert.ok([401, 500].includes(res.status), `unexpected status ${res.status}`);
  assertNoStore(res);
  const text = await res.text();
  const json = JSON.parse(text) as { success: boolean; message: string };
  assert.equal(json.success, false);
  assert.ok(["UNAUTHORIZED", "INTERNAL_ERROR"].includes(json.message));
  assert.ok(!text.includes("request scope"), "must not leak internal detail");
});
