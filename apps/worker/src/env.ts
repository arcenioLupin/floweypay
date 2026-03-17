import { BtcNetwork } from "./types/btcNetWorkTypes";

export function env(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`MISSING_ENV_${name}`);
  return v;
}

export function envNetwork(): BtcNetwork {
  const v = (process.env.BTC_NETWORK ?? "main").toLowerCase();
  if (v === "main" || v === "signet" || v === "testnet" || v === "regtest") return v;
  return "main";
}

export function envZmqRawTx(): string {
  const net = envNetwork();
  const defaults: Record<BtcNetwork, string> = {
    main: "tcp://127.0.0.1:28336",
    signet: "tcp://127.0.0.1:28334",
    testnet: "tcp://127.0.0.1:28334",
    regtest: "tcp://127.0.0.1:28332",
  };
  return process.env.BTC_ZMQ_RAWTX ?? defaults[net];
}

export function envZmqRawBlock(): string {
  const net = envNetwork();
  const defaults: Record<BtcNetwork, string> = {
    main: "tcp://127.0.0.1:28337",
    signet: "tcp://127.0.0.1:28335",
    testnet: "tcp://127.0.0.1:28335",
    regtest: "tcp://127.0.0.1:28333",
  };
  return process.env.BTC_ZMQ_RAWBLOCK ?? defaults[net];
}

export function envRpcUrl(): string {
  const net = envNetwork();
  const defaults: Record<BtcNetwork, string> = {
    main: "http://127.0.0.1:8332",
    signet: "http://127.0.0.1:38332",
    testnet: "http://127.0.0.1:18332",
    regtest: "http://127.0.0.1:18443",
  };
  return process.env.BTC_RPC_URL ?? defaults[net];
}