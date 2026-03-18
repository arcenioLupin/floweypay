import { Prisma, btc_network } from "@prisma/client";
import { getBtcRuntimeConfig } from "@/app/api/_lib/btcConfig";
import { btcRpcCall } from "@/app/api/_lib/bitcoinRpc";

const BECH32_MAINNET = /^bc1[ac-hj-np-z02-9]{11,87}$/;
const BECH32_TESTNET_FAMILY = /^(tb1|bcrt1)[ac-hj-np-z02-9]{11,87}$/;

export type BtcValidationErrorCode =
  | "BTC_UNSUPPORTED_CURRENCY"
  | "BTC_INVALID_AMOUNT_CENTS"
  | "BTC_AMOUNT_LIMIT_EXCEEDED"
  | "BTC_INVALID_SATS"
  | "BTC_SATS_LIMIT_EXCEEDED"
  | "BTC_ADDRESS_INVALID_FOR_NETWORK";

export function getBtcNetwork(): btc_network {
  return getBtcRuntimeConfig().network;
}

export function getRateLockMinutes() {
  return getBtcRuntimeConfig().rateLockMinutes;
}

export function isSupportedCurrency(currency: string): boolean {
  const cfg = getBtcRuntimeConfig();
  return cfg.supportedCurrencies.includes((currency ?? "").trim().toUpperCase());
}

export function normalizeCurrency(currency: string): string {
  return (currency ?? "").trim().toUpperCase();
}

export function validateAmountCents(amountCents: number): BtcValidationErrorCode | null {
  const cfg = getBtcRuntimeConfig();

  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents <= 0) {
    return "BTC_INVALID_AMOUNT_CENTS";
  }

  if (amountCents > cfg.maxAmountCents) {
    return "BTC_AMOUNT_LIMIT_EXCEEDED";
  }

  return null;
}

export function validateSats(sats: bigint): BtcValidationErrorCode | null {
  const cfg = getBtcRuntimeConfig();
  if (sats <= 0n) return "BTC_INVALID_SATS";
  if (sats > cfg.maxSats) return "BTC_SATS_LIMIT_EXCEEDED";
  return null;
}

function assertMockAllowed(kind: "rate" | "address") {
  const cfg = getBtcRuntimeConfig();
  if (!cfg.allowMocks && cfg.nodeEnv === "production") {
    const code = kind === "rate" ? "BTC_RATE_PROVIDER_UNAVAILABLE" : "BTC_ADDRESS_SOURCE_UNAVAILABLE";
    throw new Error(code);
  }
}

export function generateMockAddress(network: btc_network) {
  assertMockAllowed("address");

  if (network === btc_network.MAINNET) {
    return "bc1qexampleaddressxxxxxxxxxxxxxxxxxxxxxx";
  }

  if (network === btc_network.REGTEST) {
    return "bcrt1qexampleaddressxxxxxxxxxxxxxxxxxxxxx";
  }

  return "tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxx";
}

export async function allocateBtcAddress(network: btc_network): Promise<string> {
  const cfg = getBtcRuntimeConfig();

  if (cfg.addressSource === "mock") {
    return generateMockAddress(network);
  }

  if (cfg.addressSource === "rpc") {
    const address = await btcRpcCall<string>("getnewaddress", ["floweypay"]);
    if (!isAddressValidForNetwork(address, network)) {
      throw new Error("BTC_ADDRESS_INVALID_FOR_NETWORK");
    }
    return address;
  }

  throw new Error("BTC_ADDRESS_SOURCE_UNAVAILABLE");
}

// Deterministic policy: always round up so the requested fiat value is never under-collected.
export function calcSatsFromFiat(amountCents: number, fxBtcPerFiat: string): bigint {
  const D = Prisma.Decimal;

  const fiat = new D(amountCents).div(100);
  const btc = fiat.mul(new D(fxBtcPerFiat));
  const sats = btc.mul(new D(100_000_000));
  const roundedUp = sats.toDecimalPlaces(0, D.ROUND_CEIL);

  return BigInt(roundedUp.toString());
}

export function isAddressValidForNetwork(address: string, network: btc_network): boolean {
  const a = (address ?? "").trim().toLowerCase();
  if (!a) return false;

  if (network === btc_network.MAINNET) {
    return BECH32_MAINNET.test(a);
  }

  if (network === btc_network.REGTEST) {
    return a.startsWith("bcrt1") && BECH32_TESTNET_FAMILY.test(a);
  }

  return BECH32_TESTNET_FAMILY.test(a);
}

export function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}
