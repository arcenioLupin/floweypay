import test from "node:test";
import assert from "node:assert/strict";
import { payment_status } from "@prisma/client";
import { GET } from "./route";
import {
  buildStatusWhereClause,
  computeEffectiveStatus,
  mapRowToPaymentRowVm,
  parseLimitParam,
  parseStatusFilter,
  type PaymentListRow,
} from "./helpers";

// ─── Pure helper unit tests ───────────────────────────────────────────────────

test("computeEffectiveStatus: non-expired active row stays AWAITING_PAYMENT", () => {
  const result = computeEffectiveStatus(
    payment_status.AWAITING_PAYMENT,
    new Date(Date.now() + 60_000),
    new Date()
  );
  assert.equal(result, "AWAITING_PAYMENT");
});

test("computeEffectiveStatus: expired active row becomes EXPIRED", () => {
  const result = computeEffectiveStatus(
    payment_status.AWAITING_PAYMENT,
    new Date(Date.now() - 60_000),
    new Date()
  );
  assert.equal(result, "EXPIRED");
});

test("computeEffectiveStatus: CONFIRMED row is never overridden to EXPIRED", () => {
  const result = computeEffectiveStatus(
    payment_status.CONFIRMED,
    new Date(Date.now() - 60_000),
    new Date()
  );
  assert.equal(result, "CONFIRMED");
});

test("computeEffectiveStatus: null expiry is never expired", () => {
  const result = computeEffectiveStatus(
    payment_status.AWAITING_PAYMENT,
    null,
    new Date()
  );
  assert.equal(result, "AWAITING_PAYMENT");
});

test("parseStatusFilter: returns undefined for null input", () => {
  assert.equal(parseStatusFilter(null), undefined);
});

test("parseStatusFilter: parses valid status", () => {
  const result = parseStatusFilter("CONFIRMED,EXPIRED");
  assert.deepEqual(result, ["CONFIRMED", "EXPIRED"]);
});

test("parseStatusFilter: ignores invalid values", () => {
  const result = parseStatusFilter("CONFIRMED,GARBAGE");
  assert.deepEqual(result, ["CONFIRMED"]);
});

test("parseStatusFilter: returns undefined when all values are invalid", () => {
  assert.equal(parseStatusFilter("NOT_A_STATUS"), undefined);
});

test("parseLimitParam: defaults to DEFAULT_LIMIT", () => {
  assert.equal(parseLimitParam(null), 20);
});

test("parseLimitParam: caps at MAX_LIMIT", () => {
  assert.equal(parseLimitParam("9999"), 100);
});

test("parseLimitParam: parses valid value", () => {
  assert.equal(parseLimitParam("30"), 30);
});

// ─── buildStatusWhereClause ───────────────────────────────────────────────────

test("buildStatusWhereClause: AWAITING_PAYMENT excludes expired rows", () => {
  const now = new Date();
  const clause = buildStatusWhereClause([payment_status.AWAITING_PAYMENT], now);
  // Must be an OR with one branch: status=AWAITING_PAYMENT AND (expires null OR expires>now)
  assert.ok(Array.isArray((clause as { OR: unknown[] }).OR));
  const or = (clause as { OR: { status: string; OR: unknown[] }[] }).OR;
  assert.equal(or.length, 1);
  assert.equal(or[0].status, "AWAITING_PAYMENT");
  assert.ok(Array.isArray(or[0].OR)); // inner OR for expiry
});

test("buildStatusWhereClause: EXPIRED covers DB-EXPIRED and active-past-expiry", () => {
  const now = new Date();
  const clause = buildStatusWhereClause([payment_status.EXPIRED], now);
  const or = (clause as { OR: unknown[] }).OR;
  // Two branches: DB-expired rows + active-lifecycle rows with btc_expires_at <= now
  assert.equal(or.length, 2);
});

test("buildStatusWhereClause: CONFIRMED passes through unchanged", () => {
  const now = new Date();
  const clause = buildStatusWhereClause([payment_status.CONFIRMED], now);
  const or = (clause as { OR: { status: string }[] }).OR;
  assert.equal(or.length, 1);
  assert.equal(or[0].status, "CONFIRMED");
});

test("buildStatusWhereClause: mixed AWAITING_PAYMENT+EXPIRED produces correct branch count", () => {
  const now = new Date();
  const clause = buildStatusWhereClause(
    [payment_status.AWAITING_PAYMENT, payment_status.EXPIRED],
    now
  );
  const or = (clause as { OR: unknown[] }).OR;
  // 1 branch for AWAITING_PAYMENT + 2 branches for EXPIRED
  assert.equal(or.length, 3);
});

test("mapRowToPaymentRowVm: serializes BigInt fields to string", () => {
  const now = new Date();
  const row: PaymentListRow = {
    id: "pay-1",
    created_at: new Date("2026-01-01T00:00:00Z"),
    status: payment_status.CONFIRMED,
    amount_cents: 1000,
    currency: "PEN",
    btc_amount_sats: 100000n,
    btc_received_sats: 100000n,
    btc_confirmations: 1,
    btc_required_confirmations: 1,
    btc_expires_at: null,
    products: { title: "My product" },
    payment_links: { token: "tok123" },
  };

  const vm = mapRowToPaymentRowVm(row, now);
  assert.equal(vm.id, "pay-1");
  assert.equal(vm.btcAmountSats, "100000");
  assert.equal(vm.btcReceivedSats, "100000");
  assert.equal(vm.status, "CONFIRMED");
  assert.equal(vm.productTitle, "My product");
  assert.equal(vm.paymentLinkToken, "tok123");
  assert.equal(typeof vm.btcAmountSats, "string");
});

test("mapRowToPaymentRowVm: handles null btc_amount_sats", () => {
  const now = new Date();
  const row: PaymentListRow = {
    id: "pay-2",
    created_at: new Date(),
    status: payment_status.PENDING,
    amount_cents: 500,
    currency: "USD",
    btc_amount_sats: null,
    btc_received_sats: 0n,
    btc_confirmations: 0,
    btc_required_confirmations: 1,
    btc_expires_at: null,
    products: null,
    payment_links: null,
  };

  const vm = mapRowToPaymentRowVm(row, now);
  assert.equal(vm.btcAmountSats, null);
  assert.equal(vm.btcReceivedSats, "0");
  assert.equal(vm.productTitle, null);
});

// ─── HTTP handler test (auth only) ───────────────────────────────────────────
// The handler depends on next/headers cookies() which has no context in tests.
// We verify the unauthenticated path works; authenticated paths are covered by
// the pure helper tests above.

test("GET /api/payments returns 401 without valid session", async () => {
  const res = await GET(
    new Request("http://localhost/api/payments", { method: "GET" })
  );
  assert.equal(res.status, 401);
  const json = (await res.json()) as { message: string };
  assert.equal(json.message, "UNAUTHORIZED");
});
