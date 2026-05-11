import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/app/lib/prisma";
import { clearRateCacheForTests, getRateWithFallback } from "@/app/api/_lib/btcRateService";
import { POST } from "./route";

const ORIGINAL_ENV = { ...process.env };

type GenericFn = (...args: unknown[]) => unknown;

function restoreMethod(target: Record<string, unknown>, key: string, original: unknown) {
  target[key] = original;
}

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  clearRateCacheForTests();
});

test("returns 400 for unsupported currency", async () => {
  const linksModel = prisma.payment_links as unknown as Record<string, unknown>;
  const originalFindFirst = linksModel.findFirst as GenericFn;

  linksModel.findFirst = async () => ({
    id: "link-1",
    creator_id: "creator-1",
    product_id: "product-1",
    products: {
      id: "product-1",
      title: "T",
      message: "M",
      amount_cents: 100,
      currency: "EUR",
      active: true,
    },
  });

  try {
    process.env.BTC_SUPPORTED_FIAT_CURRENCIES = "USD,PEN";
    const res = await POST(new Request("http://localhost/api/start", { method: "POST" }), {
      params: Promise.resolve({ token: "tok" }),
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { message: string };
    assert.equal(json.message, "BTC_UNSUPPORTED_CURRENCY");
  } finally {
    restoreMethod(linksModel, "findFirst", originalFindFirst);
  }
});

test("uses cached rate when provider is unavailable", async () => {
  const linksModel = prisma.payment_links as unknown as Record<string, unknown>;
  const paymentsModel = prisma.payments as unknown as Record<string, unknown>;
  const prismaRoot = prisma as unknown as Record<string, unknown>;

  const originalFindLink = linksModel.findFirst as GenericFn;
  const originalFindPayment = paymentsModel.findFirst as GenericFn;
  const originalTransaction = prismaRoot.$transaction as GenericFn;

  linksModel.findFirst = async () => ({
    id: "link-2",
    creator_id: "creator-1",
    product_id: "product-1",
    products: {
      id: "product-1",
      title: "T",
      message: "M",
      amount_cents: 100,
      currency: "USD",
      active: true,
    },
  });

  let paymentFindCalls = 0;
  paymentsModel.findFirst = async () => {
    paymentFindCalls += 1;
    if (paymentFindCalls === 1) return null;
    return { id: "reused-payment" };
  };

  prismaRoot.$transaction = async (cb: GenericFn) => {
    const tx = {
      $executeRaw: async () => null,
      payments: {
        findFirst: async () => ({ id: "cached-rate-payment" }),
        create: async () => ({ id: "cached-rate-payment" }),
      },
    };
    return cb(tx);
  };

  try {
    process.env.BTC_ALLOW_MOCKS = "true";
    process.env.BTC_RATE_PROVIDER = "mock";
    await getRateWithFallback("USD");

    process.env.BTC_RATE_PROVIDER = "none";

    const res = await POST(new Request("http://localhost/api/start", { method: "POST" }), {
      params: Promise.resolve({ token: "tok" }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean };
    assert.equal(json.success, true);
  } finally {
    restoreMethod(linksModel, "findFirst", originalFindLink);
    restoreMethod(paymentsModel, "findFirst", originalFindPayment);
    restoreMethod(prismaRoot, "$transaction", originalTransaction);
  }
});

test("returns 503 when provider is unavailable and cache is empty", async () => {
  const linksModel = prisma.payment_links as unknown as Record<string, unknown>;
  const paymentsModel = prisma.payments as unknown as Record<string, unknown>;

  const originalFindLink = linksModel.findFirst as GenericFn;
  const originalFindPayment = paymentsModel.findFirst as GenericFn;

  linksModel.findFirst = async () => ({
    id: "link-3",
    creator_id: "creator-1",
    product_id: "product-1",
    products: {
      id: "product-1",
      title: "T",
      message: "M",
      amount_cents: 100,
      currency: "USD",
      active: true,
    },
  });

  paymentsModel.findFirst = async () => null;

  try {
    process.env = { ...process.env, NODE_ENV: "production" };
    process.env.BTC_ALLOW_MOCKS = "false";
    process.env.BTC_RATE_PROVIDER = "none";

    const res = await POST(new Request("http://localhost/api/start", { method: "POST" }), {
      params: Promise.resolve({ token: "tok" }),
    });

    assert.equal(res.status, 503);
    const json = (await res.json()) as { message: string };
    assert.equal(json.message, "BTC_RATE_PROVIDER_UNAVAILABLE");
  } finally {
    restoreMethod(linksModel, "findFirst", originalFindLink);
    restoreMethod(paymentsModel, "findFirst", originalFindPayment);
  }
});
