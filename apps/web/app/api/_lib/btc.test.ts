import test from "node:test";
import assert from "node:assert/strict";
import {
  calcSatsFromFiat,
  isAddressValidForNetwork,
  isSupportedCurrency,
  validateAmountCents,
  validateSats,
} from "@/app/api/_lib/btc";
import { btc_network } from "@prisma/client";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
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
