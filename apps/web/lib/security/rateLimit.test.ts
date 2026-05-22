import test from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  clearRateLimitStoreForTests,
  getClientIp,
  rateLimitResponse,
} from "./rateLimit";

test.afterEach(() => {
  clearRateLimitStoreForTests();
});

// ─── checkRateLimit ───────────────────────────────────────────────────────────

test("allows the first request and sets remaining correctly", () => {
  const result = checkRateLimit({ key: "t:k1", limit: 5, windowMs: 60_000 });
  assert.equal(result.allowed, true);
  assert.equal(result.limit, 5);
  assert.equal(result.remaining, 4);
  assert.equal(result.retryAfterSeconds, 0);
});

test("decrements remaining on each allowed call", () => {
  const opts = { key: "t:k2", limit: 3, windowMs: 60_000 };
  checkRateLimit(opts); // remaining: 2
  const second = checkRateLimit(opts); // remaining: 1
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 1);
});

test("blocks once the limit is reached", () => {
  const opts = { key: "t:k3", limit: 2, windowMs: 60_000 };
  checkRateLimit(opts); // 1st — allowed
  checkRateLimit(opts); // 2nd — allowed (remaining: 0)
  const blocked = checkRateLimit(opts); // 3rd — over limit
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("remaining is 0 on the last allowed request when limit=1", () => {
  const result = checkRateLimit({ key: "t:k4", limit: 1, windowMs: 60_000 });
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 0);
});

test("independent keys do not share counters", () => {
  const optsA = { key: "t:a", limit: 1, windowMs: 60_000 };
  checkRateLimit(optsA); // consumes the single slot
  checkRateLimit(optsA); // blocked

  const b = checkRateLimit({ key: "t:b", limit: 1, windowMs: 60_000 });
  assert.equal(b.allowed, true);
});

test("resetAt is in the future", () => {
  const before = Date.now();
  const result = checkRateLimit({ key: "t:k5", limit: 5, windowMs: 60_000 });
  assert.ok(result.resetAt.getTime() > before);
});

test("window resets after expiry and allows new requests", async () => {
  const opts = { key: "t:k6", limit: 1, windowMs: 50 }; // 50 ms window
  checkRateLimit(opts); // consumes the slot
  const blocked = checkRateLimit(opts); // blocked
  assert.equal(blocked.allowed, false);

  await new Promise((resolve) => setTimeout(resolve, 60)); // wait for window to expire

  const after = checkRateLimit(opts);
  assert.equal(after.allowed, true);
  assert.equal(after.remaining, 0); // limit=1 → 1 used → 0 remaining
});

test("retryAfterSeconds is positive and bounded when blocked", () => {
  const windowMs = 60_000;
  const opts = { key: "t:k7", limit: 1, windowMs };
  checkRateLimit(opts); // consume
  const blocked = checkRateLimit(opts);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.ok(blocked.retryAfterSeconds <= Math.ceil(windowMs / 1000));
});

// ─── getClientIp ─────────────────────────────────────────────────────────────

test("extracts the leftmost address from x-forwarded-for", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1, 192.168.1.1" },
  });
  assert.equal(getClientIp(req), "1.2.3.4");
});

test("falls back to x-real-ip when x-forwarded-for is absent", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-real-ip": "5.6.7.8" },
  });
  assert.equal(getClientIp(req), "5.6.7.8");
});

test("prefers x-forwarded-for over x-real-ip when both are present", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "9.9.9.9", "x-real-ip": "1.1.1.1" },
  });
  assert.equal(getClientIp(req), "9.9.9.9");
});

test("returns 'unknown' when no IP headers are present", () => {
  const req = new Request("http://localhost/");
  assert.equal(getClientIp(req), "unknown");
});

test("trims whitespace from x-forwarded-for entries", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "  2.3.4.5  , 10.0.0.1" },
  });
  assert.equal(getClientIp(req), "2.3.4.5");
});

// ─── rateLimitResponse ────────────────────────────────────────────────────────

test("rateLimitResponse returns HTTP 429", async () => {
  const opts = { key: "t:r1", limit: 1, windowMs: 60_000 };
  checkRateLimit(opts); // consume
  const blocked = checkRateLimit(opts);

  const res = rateLimitResponse(blocked);
  assert.equal(res.status, 429);
});

test("rateLimitResponse body matches required shape", async () => {
  const opts = { key: "t:r2", limit: 1, windowMs: 60_000 };
  checkRateLimit(opts);
  const blocked = checkRateLimit(opts);

  const body = (await rateLimitResponse(blocked).json()) as {
    message: string;
  };
  assert.equal(body.message, "Too many requests. Please try again later.");
});

test("rateLimitResponse includes all required headers", () => {
  const opts = { key: "t:r3", limit: 1, windowMs: 60_000 };
  checkRateLimit(opts);
  const blocked = checkRateLimit(opts);

  const res = rateLimitResponse(blocked);
  assert.ok(res.headers.get("retry-after") !== null, "missing Retry-After");
  assert.ok(
    res.headers.get("x-ratelimit-limit") !== null,
    "missing X-RateLimit-Limit"
  );
  assert.ok(
    res.headers.get("x-ratelimit-remaining") !== null,
    "missing X-RateLimit-Remaining"
  );
  assert.ok(
    res.headers.get("x-ratelimit-reset") !== null,
    "missing X-RateLimit-Reset"
  );
});

test("rateLimitResponse Retry-After header is a positive integer", () => {
  const opts = { key: "t:r4", limit: 1, windowMs: 60_000 };
  checkRateLimit(opts);
  const blocked = checkRateLimit(opts);

  const res = rateLimitResponse(blocked);
  const retryAfter = Number(res.headers.get("retry-after"));
  assert.ok(retryAfter > 0, `Retry-After should be positive, got ${retryAfter}`);
  assert.ok(Number.isInteger(retryAfter), "Retry-After should be an integer");
});

test("rateLimitResponse X-RateLimit-Reset is a unix timestamp in the future", () => {
  const now = Math.floor(Date.now() / 1000);
  const opts = { key: "t:r5", limit: 1, windowMs: 60_000 };
  checkRateLimit(opts);
  const blocked = checkRateLimit(opts);

  const res = rateLimitResponse(blocked);
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  assert.ok(reset > now, `X-RateLimit-Reset ${reset} should be > now ${now}`);
});
