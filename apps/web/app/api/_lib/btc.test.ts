import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateBtcAddress,
  calcSatsFromFiat,
  isAddressValidForNetwork,
  isSupportedCurrency,
  validateAmountCents,
  validateSats,
} from "@/app/api/_lib/btc";
import { btc_network } from "@prisma/client";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("calcSatsFromFiat uses ceil rounding to avoid underpayment", () => {
  const sats = calcSatsFromFiat(1, "0.00000001");
  assert.equal(sats, 1n);
});

test("supported currency validation allows USD/PEN and rejects others", () => {
  process.env.BTC_SUPPORTED_FIAT_CURRENCIES = "USD,PEN";
  assert.equal(isSupportedCurrency("usd"), true);
  assert.equal(isSupportedCurrency("PEN"), true);
  assert.equal(isSupportedCurrency("EUR"), false);
});

test("amount and sats validations enforce positive values and max caps", () => {
  process.env.BTC_MAX_AMOUNT_CENTS = "500";
  process.env.BTC_MAX_SATS = "2000";

  assert.equal(validateAmountCents(0), "BTC_INVALID_AMOUNT_CENTS");
  assert.equal(validateAmountCents(501), "BTC_AMOUNT_LIMIT_EXCEEDED");
  assert.equal(validateAmountCents(500), null);

  assert.equal(validateSats(0n), "BTC_INVALID_SATS");
  assert.equal(validateSats(2001n), "BTC_SATS_LIMIT_EXCEEDED");
  assert.equal(validateSats(2000n), null);
});

test("address validation checks network prefixes", () => {
  assert.equal(
    isAddressValidForNetwork("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", btc_network.MAINNET),
    true
  );
  assert.equal(
    isAddressValidForNetwork("tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", btc_network.MAINNET),
    false
  );
  assert.equal(
    isAddressValidForNetwork("tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", btc_network.SIGNET),
    true
  );
});

test("rpc address source fails with stable error when rpc env is missing", async () => {
  process.env.BTC_ADDRESS_SOURCE = "rpc";
  process.env.BTC_ALLOW_MOCKS = "false";
  delete process.env.BTC_RPC_WALLET;

  await assert.rejects(
    () => allocateBtcAddress(btc_network.SIGNET),
    (err: unknown) => err instanceof Error && err.message === "BTC_ADDRESS_SOURCE_UNAVAILABLE"
  );
});

test("mock address source fails in production when mocks are disabled", async () => {
  process.env = { ...process.env, NODE_ENV: "production" };
  process.env.BTC_ADDRESS_SOURCE = "mock";
  process.env.BTC_ALLOW_MOCKS = "false";

  await assert.rejects(
    () => allocateBtcAddress(btc_network.SIGNET),
    (err: unknown) => err instanceof Error && err.message === "BTC_ADDRESS_SOURCE_UNAVAILABLE"
  );
});

test("rpc happy path returns a valid signet address", async () => {
  process.env.BTC_ADDRESS_SOURCE = "rpc";
  process.env.BTC_ALLOW_MOCKS = "false";
  process.env.BTC_RPC_URL = "http://127.0.0.1:38332";
  process.env.BTC_RPC_USER = "***";
  process.env.BTC_RPC_PASSWORD = "***";
  process.env.BTC_RPC_WALLET = "floweypay";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "http://127.0.0.1:38332/wallet/floweypay");
    assert.equal(init?.method, "POST");

    const payload = JSON.parse(String(init?.body)) as {
      method: string;
      params: unknown[];
    };

    assert.equal(payload.method, "getnewaddress");
    assert.deepEqual(payload.params, ["invoice", "bech32"]);

    return new Response(
      JSON.stringify({
        result: "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        error: null,
        id: "floweypay",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }) as typeof fetch;

  const address = await allocateBtcAddress(btc_network.SIGNET);
  assert.equal(isAddressValidForNetwork(address, btc_network.SIGNET), true);
});
