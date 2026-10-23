import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CONFIRM_ATTEMPTS,
  evaluateConfirm,
  hashChallengeToken,
  generateChallengeToken,
  redactFingerprint,
  walletErrorStatus,
  type ChallengeRow,
} from "./walletOnboarding";

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ADDR = "bc1qexampleaddress0";

function baseRow(overrides: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    merchant_id: MERCHANT,
    address0: ADDR,
    expires_at: new Date(Date.now() + 60_000),
    consumed_at: null,
    attempts: 0,
    ...overrides,
  };
}

function evalWith(row: ChallengeRow | null, address0 = ADDR) {
  return evaluateConfirm({
    row,
    merchantId: MERCHANT,
    confirmedAddress0: address0,
    now: new Date(),
    maxAttempts: MAX_CONFIRM_ATTEMPTS,
  });
}

// ─── evaluateConfirm ──────────────────────────────────────────────────────────

test("evaluateConfirm: matching address on a live challenge -> CONSUME", () => {
  assert.equal(evalWith(baseRow()), "CONSUME");
});

test("evaluateConfirm: missing row -> NOT_FOUND", () => {
  assert.equal(evalWith(null), "NOT_FOUND");
});

test("evaluateConfirm: different merchant -> CROSS_MERCHANT", () => {
  assert.equal(evalWith(baseRow({ merchant_id: OTHER })), "CROSS_MERCHANT");
});

test("evaluateConfirm: already consumed -> CONSUMED (replay blocked)", () => {
  assert.equal(evalWith(baseRow({ consumed_at: new Date() })), "CONSUMED");
});

test("evaluateConfirm: expired -> EXPIRED", () => {
  assert.equal(
    evalWith(baseRow({ expires_at: new Date(Date.now() - 1000) })),
    "EXPIRED"
  );
});

test("evaluateConfirm: attempts at cap -> TOO_MANY_ATTEMPTS", () => {
  assert.equal(
    evalWith(baseRow({ attempts: MAX_CONFIRM_ATTEMPTS })),
    "TOO_MANY_ATTEMPTS"
  );
});

test("evaluateConfirm: wrong address on a live challenge -> MISMATCH", () => {
  assert.equal(evalWith(baseRow(), "bc1qwrongaddress"), "MISMATCH");
});

test("evaluateConfirm: structural rejections take precedence over mismatch", () => {
  // Consumed + wrong address must report CONSUMED, not MISMATCH.
  assert.equal(
    evalWith(baseRow({ consumed_at: new Date() }), "bc1qwrong"),
    "CONSUMED"
  );
});

// ─── Token helpers ────────────────────────────────────────────────────────────

test("hashChallengeToken: deterministic 64-char hex sha256", () => {
  const h1 = hashChallengeToken("token-abc");
  const h2 = hashChallengeToken("token-abc");
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(hashChallengeToken("token-xyz"), h1);
});

test("generateChallengeToken: unique, url-safe, high-entropy", () => {
  const a = generateChallengeToken();
  const b = generateChallengeToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 40);
});

// ─── Misc helpers ─────────────────────────────────────────────────────────────

test("redactFingerprint: masks the middle", () => {
  assert.equal(redactFingerprint("73c5da0a"), "73c5…0a");
  assert.equal(redactFingerprint("abcd"), "****");
});

test("walletErrorStatus: maps codes to HTTP status", () => {
  assert.equal(walletErrorStatus("WALLET_ALREADY_EXISTS"), 409);
  assert.equal(walletErrorStatus("WALLET_NODE_UNAVAILABLE"), 503);
  assert.equal(walletErrorStatus("UNAUTHORIZED"), 401);
  assert.equal(walletErrorStatus("WALLET_INPUT_INVALID"), 400);
  assert.equal(walletErrorStatus("WALLET_CHALLENGE_EXPIRED"), 400);
});
