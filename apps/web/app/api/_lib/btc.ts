import { Prisma, btc_network } from "@prisma/client";


export function getBtcNetwork(): btc_network {
  const n = (process.env.BTC_NETWORK ?? "SIGNET").toUpperCase();

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


export function getRateLockMinutes() {
  const n = Number(process.env.BTC_RATE_LOCK_MINUTES ?? "15");
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function generateMockAddress(network: string) {
  return network === "MAINNET"
    ? "bc1qexampleaddressxxxxxxxxxxxxxxxxxxxxxx"
    : "tb1qexampleaddressxxxxxxxxxxxxxxxxxxxxxx";
}

// BTC por 1 unidad fiat (mock MVP)
export function getMockFxRateBtcPerFiat(currency: string) {
  const cur = (currency ?? "USD").toUpperCase();
  if (cur === "USD") return { rate: "0.00002345", provider: "mock" };
  if (cur === "EUR") return { rate: "0.00002500", provider: "mock" };
  if (cur === "PEN") return { rate: "0.00000620", provider: "mock" };
  return { rate: "0.00002345", provider: "mock" };
}

export function calcSatsFromFiat(amountCents: number, fxBtcPerFiat: string): bigint {
  const D = Prisma.Decimal;

  const fiat = new D(amountCents).div(100);            // fiat units
  const btc = fiat.mul(new D(fxBtcPerFiat));           // BTC
  const sats = btc.mul(new D(100_000_000));            // sats
  const rounded = sats.toDecimalPlaces(0, D.ROUND_HALF_UP);

  return BigInt(rounded.toString());
}

export function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}
