import test from "node:test";
import assert from "node:assert/strict";
import {
  clearRateCacheForTests,
  getRateWithFallback,
  setRateProviderForTests,
} from "@/app/api/_lib/btcRateService";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  clearRateCacheForTests();
  setRateProviderForTests(null);
  process.env = { ...ORIGINAL_ENV };
});

test("returns cached quote when provider fails", async () => {
  process.env.BTC_RATE_CACHE_TTL_MS = "60000";

  setRateProviderForTests({
    async fetchRateBtcPerFiat() {
      return { rate: "0.00002", provider: "test-provider" };
    },
  });

  const first = await getRateWithFallback("USD");
  assert.equal(first.provider, "test-provider");

  setRateProviderForTests({
    async fetchRateBtcPerFiat() {
      throw new Error("boom");
    },
  });

  const fallback = await getRateWithFallback("USD");
  assert.equal(fallback.rate, "0.00002");
  assert.equal(fallback.provider, "test-provider:cache");
});

test("fails clearly when provider fails and cache is empty", async () => {
  setRateProviderForTests({
    async fetchRateBtcPerFiat() {
      throw new Error("boom");
    },
  });

  await assert.rejects(getRateWithFallback("USD"), /BTC_RATE_UNAVAILABLE/);
});
