import { btc_network } from "@prisma/client";
import { validateWebEnv } from "@/app/lib/env/webEnv";

validateWebEnv();

export type BtcRateProviderMode = "mock" | "coingecko" | "none";
export type BtcAddressSourceMode = "mock" | "rpc" | "none";

export type BtcRuntimeConfig = {
  nodeEnv: string;
  network: btc_network;
  allowMocks: boolean;
  rateProvider: BtcRateProviderMode;
  addressSource: BtcAddressSourceMode;
  rateCacheTtlMs: number;
  supportedCurrencies: string[];
  maxAmountCents: number;
  maxSats: bigint;
  rateLockMinutes: number;
  requiredConfirmations: number;
};

const DEFAULT_SUPPORTED_CURRENCIES = ["USD", "PEN"];
const DEFAULT_RATE_CACHE_TTL_MS = 30_000;
const DEFAULT_MAX_AMOUNT_CENTS = 10_000_000; // 100,000.00 fiat
const DEFAULT_MAX_SATS = 5_000_000_000n; // 50 BTC
const DEFAULT_RATE_LOCK_MINUTES = 15;
const DEFAULT_REQUIRED_CONFIRMATIONS = 1;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n <= 0) return fallback;
  return n;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return fallback;
}

function parseNetwork(raw: string | undefined): btc_network {
  const n = (raw ?? "SIGNET").toUpperCase();
  switch (n) {
    case "MAINNET":
      return btc_network.MAINNET;
    case "TESTNET":
      return btc_network.TESTNET;
    case "REGTEST":
      return btc_network.REGTEST;
    case "SIGNET":
    default:
      return btc_network.SIGNET;
  }
}

function parseRateProvider(raw: string | undefined, fallback: BtcRateProviderMode): BtcRateProviderMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "mock" || v === "coingecko" || v === "none") return v;
  return fallback;
}

function parseAddressSource(raw: string | undefined, fallback: BtcAddressSourceMode): BtcAddressSourceMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "mock" || v === "rpc" || v === "none") return v;
  return fallback;
}

function parseSupportedCurrencies(raw: string | undefined): string[] {
  const list = (raw ?? DEFAULT_SUPPORTED_CURRENCIES.join(","))
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

  return list.length > 0 ? [...new Set(list)] : DEFAULT_SUPPORTED_CURRENCIES;
}

export function getBtcRuntimeConfig(): BtcRuntimeConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";

  const allowMocksDefault = !isProd;
  const allowMocks = parseBool(process.env.BTC_ALLOW_MOCKS, allowMocksDefault);

  const defaultRateProvider: BtcRateProviderMode = allowMocks ? "mock" : "none";
  const defaultAddressSource: BtcAddressSourceMode = allowMocks ? "mock" : "none";

  return {
    nodeEnv,
    network: parseNetwork(process.env.BTC_NETWORK),
    allowMocks,
    rateProvider: parseRateProvider(process.env.BTC_RATE_PROVIDER, defaultRateProvider),
    addressSource: parseAddressSource(process.env.BTC_ADDRESS_SOURCE, defaultAddressSource),
    rateCacheTtlMs: parsePositiveInt(process.env.BTC_RATE_CACHE_TTL_MS, DEFAULT_RATE_CACHE_TTL_MS),
    supportedCurrencies: parseSupportedCurrencies(process.env.BTC_SUPPORTED_FIAT_CURRENCIES),
    maxAmountCents: parsePositiveInt(process.env.BTC_MAX_AMOUNT_CENTS, DEFAULT_MAX_AMOUNT_CENTS),
    maxSats: BigInt(parsePositiveInt(process.env.BTC_MAX_SATS, Number(DEFAULT_MAX_SATS))),
    rateLockMinutes: parsePositiveInt(process.env.BTC_RATE_LOCK_MINUTES, DEFAULT_RATE_LOCK_MINUTES),
    requiredConfirmations: parsePositiveInt(
      process.env.BTC_REQUIRED_CONFIRMATIONS,
      DEFAULT_REQUIRED_CONFIRMATIONS
    ),
  };
}
