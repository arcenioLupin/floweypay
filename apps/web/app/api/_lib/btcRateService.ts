import { getBtcRuntimeConfig } from "@/app/api/_lib/btcConfig";

export type FxRateQuote = {
  rate: string;
  provider: string;
  fetchedAt: Date;
};

type RateCacheEntry = {
  rate: string;
  provider: string;
  expiresAtMs: number;
  fetchedAtMs: number;
};

export type BtcRateProvider = {
  fetchRateBtcPerFiat(currency: string): Promise<{ rate: string; provider: string }>;
};

class MockRateProvider implements BtcRateProvider {
  fetchRateBtcPerFiat(currency: string): Promise<{ rate: string; provider: string }> {
    const cur = currency.toUpperCase();
    if (cur === "USD") return Promise.resolve({ rate: "0.00002345", provider: "mock" });
    if (cur === "PEN") return Promise.resolve({ rate: "0.00000620", provider: "mock" });
    return Promise.resolve({ rate: "0.00002345", provider: "mock" });
  }
}

class DisabledRateProvider implements BtcRateProvider {
  fetchRateBtcPerFiat(_currency: string): Promise<{ rate: string; provider: string }> {
    return Promise.reject(new Error("BTC_RATE_PROVIDER_UNAVAILABLE"));
  }
}

const rateCache = new Map<string, RateCacheEntry>();
let providerOverride: BtcRateProvider | null = null;

function getProvider(): BtcRateProvider {
  if (providerOverride) return providerOverride;

  const cfg = getBtcRuntimeConfig();
  if (cfg.rateProvider === "mock") {
    if (cfg.nodeEnv === "production" && !cfg.allowMocks) {
      return new DisabledRateProvider();
    }
    return new MockRateProvider();
  }

  // Placeholder for real provider wiring.
  return new DisabledRateProvider();
}

export function clearRateCacheForTests() {
  rateCache.clear();
}

export function setRateProviderForTests(provider: BtcRateProvider | null) {
  providerOverride = provider;
}

export async function getRateWithFallback(currency: string): Promise<FxRateQuote> {
  const cfg = getBtcRuntimeConfig();
  const key = currency.toUpperCase();
  const nowMs = Date.now();
  const cached = rateCache.get(key);

  try {
    const provider = getProvider();
    const fresh = await provider.fetchRateBtcPerFiat(key);

    rateCache.set(key, {
      rate: fresh.rate,
      provider: fresh.provider,
      fetchedAtMs: nowMs,
      expiresAtMs: nowMs + cfg.rateCacheTtlMs,
    });

    return { rate: fresh.rate, provider: fresh.provider, fetchedAt: new Date(nowMs) };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (err instanceof Error && err.message === "BTC_RATE_PROVIDER_UNAVAILABLE") {
      if (cached && cached.expiresAtMs > nowMs) {
        console.warn("[fxrate] provider unavailable, serving stale cache:", {
          currency: key,
          provider: cached.provider,
          cacheAgeMs: nowMs - cached.fetchedAtMs,
        });
        return {
          rate: cached.rate,
          provider: `${cached.provider}:cache`,
          fetchedAt: new Date(cached.fetchedAtMs),
        };
      }

      console.error("[fxrate] provider unavailable, no cache fallback:", { currency: key });
      throw new Error("BTC_RATE_PROVIDER_UNAVAILABLE");
    }

    if (cached && cached.expiresAtMs > nowMs) {
      console.warn("[fxrate] provider error, serving stale cache:", {
        currency: key,
        provider: cached.provider,
        error: errMsg,
        cacheAgeMs: nowMs - cached.fetchedAtMs,
      });
      return {
        rate: cached.rate,
        provider: `${cached.provider}:cache`,
        fetchedAt: new Date(cached.fetchedAtMs),
      };
    }

    console.error("[fxrate] provider error, no cache fallback:", { currency: key, error: errMsg });
    throw new Error("BTC_RATE_UNAVAILABLE");
  }
}
