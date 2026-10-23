import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Prisma } from "@prisma/client";
import {
  allocateReceivingAddress,
  AllocationError,
  ALLOCATION_ERROR_CODES,
  type AllocationDeps,
  type PaymentDraft,
} from "./addressAllocation";
import {
  DurableHwmStore,
  HwmError,
  HWM_ERROR_CODES,
  type ConsumeResult,
} from "./hwm/durableHwmStore";
import { WalletRpcError, WALLET_RPC_ERROR_CODES } from "./walletRpc";

// ── These are pure service-level tests. They inject a fake Prisma client, a
// fake Durable HWM store, and a fake deterministic deriver. Concurrency here is
// SIMULATED (hooks that throw P2002 / deadlock), clearly distinct from a real
// database-enforced race, which still requires integration testing against a
// disposable PostgreSQL instance. No real DB, Bitcoin Core, or HWM is touched.

const WALLET_V1 = "11111111-1111-1111-1111-111111111111";
const WALLET_V2 = "22222222-2222-2222-2222-222222222222";

const DRAFT: PaymentDraft = {
  productId: "prod-1",
  creatorId: "creator-1",
  amountCents: 1000,
  currency: "USD",
  btcNetwork: "TESTNET",
  btcAmountSats: 50_000n,
};

// ─── Test-only in-memory Durable HWM fake (NEVER used in production) ──────────

class InMemoryHwmStore implements DurableHwmStore {
  private counters = new Map<string, number>();
  private ops = new Map<string, number>();
  mode: "ok" | "unavailable" | "ambiguous" = "ok";

  async consumeNext(
    walletVersionId: string,
    operationId: string
  ): Promise<ConsumeResult> {
    if (this.mode === "unavailable") {
      throw new HwmError(HWM_ERROR_CODES.UNAVAILABLE);
    }
    if (this.mode === "ambiguous") {
      throw new HwmError(HWM_ERROR_CODES.AMBIGUOUS);
    }
    const key = `${walletVersionId}:${operationId}`;
    const seen = this.ops.get(key);
    if (seen !== undefined) return { index: seen };
    const next = this.counters.get(walletVersionId) ?? 0;
    this.counters.set(walletVersionId, next + 1);
    this.ops.set(key, next);
    return { index: next };
  }

  hasConsumed(walletVersionId: string, operationId: string): boolean {
    return this.ops.has(`${walletVersionId}:${operationId}`);
  }
}

// ─── Fake Prisma ─────────────────────────────────────────────────────────────

interface AllocationRow {
  wallet_version_id: string;
  derivation_index: bigint;
  btc_address: string;
  network: string;
  payment_id: string | null;
  burn_reason: string | null;
}
interface PaymentRow {
  id: string;
  product_id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  btc_network: string;
  btc_amount_sats: bigint;
}

interface VersionShape {
  lifecycle: string;
  network: string;
  descriptor: string;
  descriptor_checksum: string;
  recovery_state: { recovery_state: string } | null;
}

interface LockedRow {
  lifecycle: string;
  network: string;
  recovery_state: string;
  descriptor_checksum: string;
}

/** A captured raw-SQL invocation (reconstructed with $N placeholders). */
interface RawCall {
  kind: "execute" | "query";
  sql: string;
  values: unknown[];
}

interface FakeOpts {
  version: VersionShape | null;
  lockedRows?: LockedRow[];
  /** Hook invoked at the start of every payments.create (tx path). */
  onPaymentCreate?: () => Promise<void> | void;
  /** Hook invoked at the start of every allocation.create (tx path). */
  onAllocationCreate?: () => Promise<void> | void;
  /**
   * Simulate a lost COMMIT acknowledgement exactly once: the transaction body
   * runs to completion (rows persisted) but $transaction then rejects with a
   * connection-style error, as if the COMMIT ack never reached the client.
   */
  commitAckLostOnce?: boolean;
}

/** Reconstruct the SQL text of a tagged-template raw call with $N placeholders. */
function reconstructSql(strings: readonly string[], values: unknown[]): string {
  return strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
    ""
  );
}

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

function allocKey(walletVersionId: string, index: number): string {
  return `${walletVersionId}:${index}`;
}

function createFakeDb(opts: FakeOpts) {
  const allocations = new Map<string, AllocationRow>();
  const payments = new Map<string, PaymentRow>();
  const rawCalls: RawCall[] = [];
  let seq = 0;
  let commitAckLost = opts.commitAckLostOnce === true;

  const lockedRows: LockedRow[] =
    opts.lockedRows ??
    (opts.version
      ? [
          {
            lifecycle: opts.version.lifecycle,
            network: opts.version.network,
            recovery_state: opts.version.recovery_state?.recovery_state ?? "",
            descriptor_checksum: opts.version.descriptor_checksum,
          },
        ]
      : []);

  const allocationModel = {
    findUnique: async ({
      where,
    }: {
      where: {
        wallet_version_id_derivation_index: {
          wallet_version_id: string;
          derivation_index: bigint;
        };
      };
    }) => {
      const { wallet_version_id, derivation_index } =
        where.wallet_version_id_derivation_index;
      const row = allocations.get(
        allocKey(wallet_version_id, Number(derivation_index))
      );
      return row
        ? { btc_address: row.btc_address, payment_id: row.payment_id }
        : null;
    },
    create: async ({ data }: { data: AllocationRow }) => {
      if (opts.onAllocationCreate) await opts.onAllocationCreate();
      const key = allocKey(
        data.wallet_version_id,
        Number(data.derivation_index)
      );
      if (allocations.has(key)) throw p2002(["wallet_version_id", "derivation_index"]);
      for (const r of allocations.values()) {
        if (r.btc_address === data.btc_address) throw p2002(["btc_address"]);
      }
      allocations.set(key, {
        ...data,
        derivation_index: BigInt(data.derivation_index),
      });
      return { id: `alloc-${key}` };
    },
  };

  const paymentsModel = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      payments.get(where.id) ?? null,
    create: async ({ data }: { data: Omit<PaymentRow, "id"> }) => {
      if (opts.onPaymentCreate) await opts.onPaymentCreate();
      const id = `pay-${++seq}`;
      payments.set(id, { id, ...data });
      return { id };
    },
  };

  const txClient = {
    $executeRaw: async (strings: readonly string[], ...values: unknown[]) => {
      rawCalls.push({
        kind: "execute",
        sql: reconstructSql(strings, values),
        values,
      });
      return 1;
    },
    $queryRaw: async (strings: readonly string[], ...values: unknown[]) => {
      rawCalls.push({
        kind: "query",
        sql: reconstructSql(strings, values),
        values,
      });
      return lockedRows;
    },
    wallet_address_allocations: allocationModel,
    payments: paymentsModel,
  };

  const db = {
    merchant_wallet_versions: {
      findUnique: async () => opts.version,
    },
    wallet_address_allocations: allocationModel,
    payments: paymentsModel,
    $transaction: async <T>(cb: (tx: typeof txClient) => Promise<T>) => {
      const result = await cb(txClient);
      // Simulate a lost COMMIT ack: the body committed, but the client sees a
      // connection-style error. Not retryable/unique → the service rethrows.
      if (commitAckLost) {
        commitAckLost = false;
        throw new Error("Connection terminated unexpectedly");
      }
      return result;
    },
  };

  /** Seed a committed winner allocation+payment (simulates a concurrent commit). */
  function seedWinner(index: number, intent: Partial<PaymentDraft> = {}): string {
    const id = `winner-${++seq}`;
    const merged = { ...DRAFT, ...intent };
    payments.set(id, {
      id,
      product_id: merged.productId,
      creator_id: merged.creatorId,
      amount_cents: merged.amountCents,
      currency: merged.currency,
      btc_network: merged.btcNetwork,
      btc_amount_sats: merged.btcAmountSats,
    });
    allocations.set(allocKey(WALLET_V1, index), {
      wallet_version_id: WALLET_V1,
      derivation_index: BigInt(index),
      btc_address: `winner-addr-${index}`,
      network: merged.btcNetwork,
      payment_id: id,
      burn_reason: null,
    });
    return id;
  }

  /** Seed a BURNED allocation (payment_id NULL, burn_reason set) at an index. */
  function seedBurned(index: number, reason = "SAFETY_RANGE_BURN"): void {
    allocations.set(allocKey(WALLET_V1, index), {
      wallet_version_id: WALLET_V1,
      derivation_index: BigInt(index),
      btc_address: `burned-addr-${index}`,
      network: DRAFT.btcNetwork,
      payment_id: null,
      burn_reason: reason,
    });
  }

  return {
    db: db as unknown as AllocationDeps["prisma"],
    allocations,
    payments,
    rawCalls,
    seedWinner,
    seedBurned,
  };
}

function readyVersion(overrides: Partial<VersionShape> = {}): VersionShape {
  return {
    lifecycle: "ACTIVE",
    network: "TESTNET",
    descriptor: "wpkh([73c5da0a/84h/1h/0h]tpubDExample/0/*)#abcdabcd",
    descriptor_checksum: "abcdabcd",
    recovery_state: { recovery_state: "READY" },
    ...overrides,
  };
}

const deriveOk: AllocationDeps["deriveAddress"] = async (_descriptor, index) =>
  `tb1q-derived-${index}`;

async function expectAllocationError(
  fn: () => Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await fn();
    assert.fail(`expected AllocationError ${code}, got success`);
  } catch (err) {
    assert.ok(
      err instanceof AllocationError,
      `expected AllocationError, got ${String(err)}`
    );
    assert.equal((err as AllocationError).code, code);
  }
}

// ─── 1. Happy path: atomic Payment + ATTRIBUTED allocation ───────────────────

test("allocates a new attributed address at index 0", async () => {
  const { db, allocations, payments, rawCalls, seedWinner } = createFakeDb({
    version: readyVersion(),
  });
  void seedWinner;
  const hwm = new InMemoryHwmStore();

  const res = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-1", draft: DRAFT },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );

  assert.equal(res.reused, false);
  assert.equal(res.derivationIndex, 0);
  assert.equal(res.btcAddress, "tb1q-derived-0");
  assert.equal(payments.size, 1);
  const alloc = allocations.get(allocKey(WALLET_V1, 0));
  assert.ok(alloc);
  assert.equal(alloc?.payment_id, res.paymentId);
  assert.equal(alloc?.burn_reason, null);
  assert.equal(alloc?.btc_address, "tb1q-derived-0");

  // SQL-shape guard (does NOT prove real locking — see file header): the tx
  // must issue the advisory lock keyed by the wallet version, then the
  // FOR UPDATE OF v, r row lock with the UUID-cast version id parameter.
  const advisory = rawCalls.find((c) => c.kind === "execute");
  assert.ok(advisory, "expected an advisory-lock $executeRaw call");
  assert.match(advisory!.sql, /pg_advisory_xact_lock/);
  assert.match(advisory!.sql, /hashtextextended/);
  assert.deepEqual(advisory!.values, [WALLET_V1]);

  const lockSelect = rawCalls.find(
    (c) => c.kind === "query" && /FOR UPDATE OF v, r/.test(c.sql)
  );
  assert.ok(lockSelect, "expected a FOR UPDATE OF v, r $queryRaw call");
  assert.match(lockSelect!.sql, /FOR UPDATE OF v, r/);
  assert.match(lockSelect!.sql, /\$1::uuid/);
  assert.match(lockSelect!.sql, /descriptor_checksum/);
  assert.deepEqual(lockSelect!.values, [WALLET_V1]);
});

// ─── 5. Two concurrent allocations for the same wallet version get distinct indices ─

test("distinct operations on same wallet version receive distinct indices", async () => {
  const { db, allocations } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();

  const a = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-a", draft: DRAFT },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );
  const b = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-b", draft: DRAFT },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );

  assert.notEqual(a.derivationIndex, b.derivationIndex);
  assert.notEqual(a.paymentId, b.paymentId);
  assert.equal(allocations.size, 2);
});

// ─── 6. Independent indices across different wallet versions ──────────────────

test("different wallet versions allocate independently from index 0", async () => {
  const dbA = createFakeDb({ version: readyVersion() });
  const dbB = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();

  const a = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-x", draft: DRAFT },
    { prisma: dbA.db, hwm, deriveAddress: deriveOk }
  );
  const b = await allocateReceivingAddress(
    { walletVersionId: WALLET_V2, operationId: "op-y", draft: DRAFT },
    { prisma: dbB.db, hwm, deriveAddress: deriveOk }
  );

  assert.equal(a.derivationIndex, 0);
  assert.equal(b.derivationIndex, 0);
});

// ─── 7. Same operationId replay returns the same Payment ─────────────────────

test("same operationId replay returns the same committed Payment (reused)", async () => {
  const { db } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();

  const first = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-rep", draft: DRAFT },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );
  const second = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-rep", draft: DRAFT },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );

  assert.equal(second.reused, true);
  assert.equal(second.paymentId, first.paymentId);
  assert.equal(second.derivationIndex, first.derivationIndex);
});

// ─── 8. Same operationId, different intent → rejected (per-field matrix) ─────

const INTENT_MISMATCH_CASES: Array<[string, Partial<PaymentDraft>]> = [
  ["productId", { productId: "prod-OTHER" }],
  ["creatorId", { creatorId: "creator-OTHER" }],
  ["amountCents", { amountCents: 9999 }],
  ["currency", { currency: "PEN" }],
  ["btcNetwork", { btcNetwork: "MAINNET" }],
  ["btcAmountSats", { btcAmountSats: 99_999n }],
];

for (const [field, override] of INTENT_MISMATCH_CASES) {
  test(`same operationId with a different ${field} is rejected (OPERATION_INTENT_MISMATCH)`, async () => {
    const { db, payments } = createFakeDb({ version: readyVersion() });
    const hwm = new InMemoryHwmStore();

    const first = await allocateReceivingAddress(
      { walletVersionId: WALLET_V1, operationId: "op-m", draft: DRAFT },
      { prisma: db, hwm, deriveAddress: deriveOk }
    );

    // A replay with the SAME operationId but a changed stable intent field
    // must be rejected rather than silently returning the stored Payment.
    // btcNetwork is special: the early network-vs-wallet check fires first.
    const expected =
      field === "btcNetwork"
        ? ALLOCATION_ERROR_CODES.NETWORK_MISMATCH
        : ALLOCATION_ERROR_CODES.OPERATION_INTENT_MISMATCH;

    await expectAllocationError(
      () =>
        allocateReceivingAddress(
          {
            walletVersionId: WALLET_V1,
            operationId: "op-m",
            draft: { ...DRAFT, ...override },
          },
          { prisma: db, hwm, deriveAddress: deriveOk }
        ),
      expected
    );

    // No duplicate Payment was created; the original remains intact.
    assert.equal(payments.size, 1);
    assert.ok(payments.get(first.paymentId));
  });
}

// Time-derived FX / expiry fields are intentionally NOT part of the intent;
// a replay that only changes them must still return the original Payment.
test("replay with changed FX/expiry (non-intent) fields still returns the original Payment", async () => {
  const { db, payments } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();

  const first = await allocateReceivingAddress(
    {
      walletVersionId: WALLET_V1,
      operationId: "op-fx",
      draft: { ...DRAFT, btcFxRate: 100000, btcRateProvider: "p1" },
    },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );

  const replay = await allocateReceivingAddress(
    {
      walletVersionId: WALLET_V1,
      operationId: "op-fx",
      draft: {
        ...DRAFT,
        btcFxRate: 999999,
        btcRateProvider: "p2",
        btcExpiresAt: new Date(),
      },
    },
    { prisma: db, hwm, deriveAddress: deriveOk }
  );

  assert.equal(replay.reused, true);
  assert.equal(replay.paymentId, first.paymentId);
  assert.equal(payments.size, 1);
});

// ─── 9. HWM unavailable ──────────────────────────────────────────────────────

test("HWM unavailable fails closed (HWM_UNAVAILABLE)", async () => {
  const { db } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();
  hwm.mode = "unavailable";

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-u", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.HWM_UNAVAILABLE
  );
});

// ─── 10. HWM ambiguous ───────────────────────────────────────────────────────

test("HWM ambiguous fails closed (HWM_AMBIGUOUS); retry uses same operationId", async () => {
  const { db } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();
  hwm.mode = "ambiguous";

  const call = () =>
    allocateReceivingAddress(
      { walletVersionId: WALLET_V1, operationId: "op-amb", draft: DRAFT },
      { prisma: db, hwm, deriveAddress: deriveOk }
    );
  await expectAllocationError(call, ALLOCATION_ERROR_CODES.HWM_AMBIGUOUS);
  // A retry with the SAME operationId must still fail closed (never guessed).
  await expectAllocationError(call, ALLOCATION_ERROR_CODES.HWM_AMBIGUOUS);
});

// ─── 11. Missing production HWM adapter fails closed ─────────────────────────

test("default (missing) production HWM adapter fails closed", async () => {
  const { db } = createFakeDb({ version: readyVersion() });
  // hwm left as the production default (MissingHwmAdapter).
  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-missing", draft: DRAFT },
        { prisma: db, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.HWM_ADAPTER_MISSING
  );
});

// ─── 12. Derivation failure after HWM consumption: index stays consumed ──────

test("derivation failure after HWM consume leaves index consumed", async () => {
  const { db, allocations } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();
  const deriveFail: AllocationDeps["deriveAddress"] = async () => {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE);
  };

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-dfail", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveFail }
      ),
    ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE
  );

  // Index was durably consumed and is NOT released; nothing was persisted.
  assert.equal(hwm.hasConsumed(WALLET_V1, "op-dfail"), true);
  assert.equal(allocations.size, 0);
});

// ─── 13. PostgreSQL rollback after HWM consume: index stays consumed ─────────

test("PostgreSQL rollback after HWM consume leaves index consumed, no partial payment", async () => {
  const { db, allocations, payments } = createFakeDb({
    version: readyVersion(),
    onPaymentCreate: () => {
      throw new Error("db connection lost");
    },
  });
  const hwm = new InMemoryHwmStore();

  await assert.rejects(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-rb", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    /db connection lost/
  );

  assert.equal(hwm.hasConsumed(WALLET_V1, "op-rb"), true);
  assert.equal(payments.size, 0);
  assert.equal(allocations.size, 0);
});

// ─── 14. Unique index conflict resolves to the idempotent winner ─────────────

test("unique index conflict re-reads and returns the idempotent winner", async () => {
  let winnerId = "";
  const fake = createFakeDb({
    version: readyVersion(),
    onAllocationCreate: () => {
      // Simulate a concurrent attempt that committed first on this index.
      if (!winnerId) {
        winnerId = fake.seedWinner(0, DRAFT);
      }
    },
  });
  const hwm = new InMemoryHwmStore();

  const res = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-race", draft: DRAFT },
    { prisma: fake.db, hwm, deriveAddress: deriveOk }
  );

  assert.equal(res.reused, true);
  assert.equal(res.paymentId, winnerId);
});

// ─── 14b. Unique address conflict (non-idempotent) fails closed ──────────────

test("unique conflict on a different constraint fails closed with ALLOCATION_CONFLICT", async () => {
  const fake = createFakeDb({
    version: readyVersion(),
    onAllocationCreate: () => {
      // A foreign address collision with no attributable winner at this index.
      throw p2002(["btc_address"]);
    },
  });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-addr", draft: DRAFT },
        { prisma: fake.db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.ALLOCATION_CONFLICT
  );
});

// ─── 15. Wallet not ACTIVE (early gate, before HWM consume) ──────────────────

test("wallet not ACTIVE fails closed before consuming HWM", async () => {
  const { db } = createFakeDb({
    version: readyVersion({ lifecycle: "RETIRED" }),
  });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-inactive", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.WALLET_NOT_ACTIVE
  );
  assert.equal(hwm.hasConsumed(WALLET_V1, "op-inactive"), false);
});

// ─── 16. Wallet not READY (early gate, before HWM consume) ───────────────────

test("wallet not READY fails closed before consuming HWM", async () => {
  const { db } = createFakeDb({
    version: readyVersion({ recovery_state: { recovery_state: "RECONCILING" } }),
  });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-notready", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.WALLET_NOT_READY
  );
  assert.equal(hwm.hasConsumed(WALLET_V1, "op-notready"), false);
});

// ─── 17. Wallet becomes ineligible AFTER HWM consume: tx rejects/rolls back ──

test("wallet state change under lock rejects and rolls back (index stays consumed)", async () => {
  const { db, allocations } = createFakeDb({
    version: readyVersion(),
    // Initial check passes, but the authoritative locked read shows RETIRED.
    lockedRows: [
      {
        lifecycle: "RETIRED",
        network: "TESTNET",
        recovery_state: "READY",
        descriptor_checksum: "abcdabcd",
      },
    ],
  });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-change", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.WALLET_NOT_ACTIVE
  );
  assert.equal(hwm.hasConsumed(WALLET_V1, "op-change"), true);
  assert.equal(allocations.size, 0);
});

// ─── 18. Network mismatch (early gate) ───────────────────────────────────────

test("network mismatch fails closed before consuming HWM", async () => {
  const { db } = createFakeDb({ version: readyVersion({ network: "MAINNET" }) });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-net", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.NETWORK_MISMATCH
  );
  assert.equal(hwm.hasConsumed(WALLET_V1, "op-net"), false);
});

// ─── 19. Ambiguous PostgreSQL commit: retry resolves via allocation ledger ───

test("ambiguous commit resolves on retry via the allocation ledger", async () => {
  let winnerId = "";
  let attempt = 0;
  const fake = createFakeDb({
    version: readyVersion(),
    onPaymentCreate: () => {
      attempt += 1;
      if (attempt === 1) {
        // The commit actually went through, but the client saw an ambiguous
        // (transient) failure. Seed the committed winner, then throw retryable.
        winnerId = fake.seedWinner(0, DRAFT);
        throw new Error("deadlock detected");
      }
    },
  });
  const hwm = new InMemoryHwmStore();

  const res = await allocateReceivingAddress(
    { walletVersionId: WALLET_V1, operationId: "op-ambcommit", draft: DRAFT },
    { prisma: fake.db, hwm, deriveAddress: deriveOk }
  );

  assert.equal(res.reused, true);
  assert.equal(res.paymentId, winnerId);
});

// ─── Wallet version not found ────────────────────────────────────────────────

test("missing wallet version fails closed", async () => {
  const { db } = createFakeDb({ version: null });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-404", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.WALLET_VERSION_NOT_FOUND
  );
});

// ─── Invalid input ───────────────────────────────────────────────────────────

test("invalid input is rejected before any external call", async () => {
  const { db } = createFakeDb({ version: readyVersion() });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: "", operationId: "op", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.INVALID_INPUT
  );
  assert.equal(hwm.hasConsumed("", "op"), false);
});

// ─── Out-of-domain index returned by HWM fails closed ────────────────────────

test("an out-of-domain HWM index fails closed before derivation/persistence", async () => {
  const { db, allocations } = createFakeDb({ version: readyVersion() });
  const badHwm: DurableHwmStore = {
    async consumeNext() {
      return { index: 2 ** 31 }; // out of the BIP84 external domain
    },
  };

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-bad", draft: DRAFT },
        { prisma: db, hwm: badHwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE
  );
  assert.equal(allocations.size, 0);
});

// ─── Descriptor identity change between unlocked read and locked read ────────

test("descriptor checksum change under lock fails closed (index stays consumed)", async () => {
  const { db, allocations, payments } = createFakeDb({
    version: readyVersion({ descriptor_checksum: "abcdabcd" }),
    // Initial unlocked read observes checksum "abcdabcd"; the authoritative
    // locked read observes a DIFFERENT checksum — the derived address can no
    // longer be trusted, so the service must fail closed before inserting.
    lockedRows: [
      {
        lifecycle: "ACTIVE",
        network: "TESTNET",
        recovery_state: "READY",
        descriptor_checksum: "ffffffff",
      },
    ],
  });
  const hwm = new InMemoryHwmStore();

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-chk", draft: DRAFT },
        { prisma: db, hwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.DERIVATION_UNAVAILABLE
  );
  // Nothing persisted; the durably consumed index is not released/reused.
  assert.equal(payments.size, 0);
  assert.equal(allocations.size, 0);
  assert.equal(hwm.hasConsumed(WALLET_V1, "op-chk"), true);
});

// ─── Realistic ambiguous commit: lost COMMIT ack, resolved by caller retry ───

test("lost COMMIT ack is resolved by a same-operationId retry (no duplicate)", async () => {
  // Single shared fake DB + HWM across both top-level calls.
  const fake = createFakeDb({
    version: readyVersion(),
    commitAckLostOnce: true,
  });
  const hwm = new InMemoryHwmStore();

  const call = () =>
    allocateReceivingAddress(
      { walletVersionId: WALLET_V1, operationId: "op-lostack", draft: DRAFT },
      { prisma: fake.db, hwm, deriveAddress: deriveOk }
    );

  // 1st call: the body persists Payment + allocation, but $transaction then
  // rejects with a connection-style error (lost COMMIT ack). The service does
  // NOT broaden retry matching, so it rethrows this error.
  await assert.rejects(call, /Connection terminated/);
  assert.equal(fake.payments.size, 1);
  assert.equal(fake.allocations.size, 1);

  // 2nd call: same walletVersionId + operationId → HWM returns the SAME index →
  // the fast-path replay finds the committed row and returns it as reused.
  const retry = await call();
  assert.equal(retry.reused, true);

  // No duplicate Payment or allocation was created.
  assert.equal(fake.payments.size, 1);
  assert.equal(fake.allocations.size, 1);
  const committed = [...fake.payments.values()][0];
  assert.equal(retry.paymentId, committed.id);
});

// ─── Previously BURNED index returned by HWM fails closed ────────────────────

test("HWM index that is already BURNED fails closed with ALLOCATION_CONFLICT", async () => {
  const fake = createFakeDb({ version: readyVersion() });
  // The ledger already has a BURNED allocation at index 0 (payment_id NULL).
  fake.seedBurned(0);
  // Force the HWM to hand back that exact burned index.
  const burnedIndexHwm: DurableHwmStore = {
    async consumeNext() {
      return { index: 0 };
    },
  };

  await expectAllocationError(
    () =>
      allocateReceivingAddress(
        { walletVersionId: WALLET_V1, operationId: "op-burned", draft: DRAFT },
        { prisma: fake.db, hwm: burnedIndexHwm, deriveAddress: deriveOk }
      ),
    ALLOCATION_ERROR_CODES.ALLOCATION_CONFLICT
  );
  // No Payment created; the burned row is untouched and not reused.
  assert.equal(fake.payments.size, 0);
  assert.equal(fake.allocations.size, 1);
  const burned = fake.allocations.get(allocKey(WALLET_V1, 0));
  assert.equal(burned?.payment_id, null);
});

// ─── 20. No private-key handling or wallet imports (static guarantee) ────────

test("service source never imports descriptors or touches private keys", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const forbidden = [
    "importdescriptors",
    "importmulti",
    "getnewaddress",
    "importprivkey",
    "privkey",
    "dumpprivkey",
    "btcWalletRpcCall",
  ];
  const allocSrc = readFileSync(
    join(here, "addressAllocation.ts"),
    "utf8"
  ).toLowerCase();
  for (const token of forbidden) {
    assert.ok(
      !allocSrc.includes(token.toLowerCase()),
      `addressAllocation.ts must not reference ${token}`
    );
  }
  // walletRpc derivation path must use node-level RPC only — never the
  // wallet-scoped RPC transport (which could import/sign). Prose mentions of
  // forbidden methods in doc comments are intentional and allowed here.
  const walletSrc = readFileSync(join(here, "walletRpc.ts"), "utf8");
  assert.ok(
    !walletSrc.includes("btcWalletRpcCall"),
    "walletRpc.ts must not call the wallet-scoped RPC transport"
  );
});
