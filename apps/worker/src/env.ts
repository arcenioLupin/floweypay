import { BtcNetwork } from "./types/btcNetWorkTypes";

export function env(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`MISSING_ENV_${name}`);
  return v;
}

export function envNetwork(): BtcNetwork {
  const raw = process.env.BTC_NETWORK;
  if (!raw) throw new Error("MISSING_ENV_BTC_NETWORK");

  const v = raw.trim().toLowerCase();

  if (v === "main" || v === "mainnet") {
    if (process.env.FLOWEYPAY_MAINNET_CONFIRMED !== "true") {
      throw new Error(
        "MAINNET_NOT_CONFIRMED: set FLOWEYPAY_MAINNET_CONFIRMED=true to run against mainnet"
      );
    }
    return "main";
  }

  if (v === "signet") return "signet";
  if (v === "testnet") return "testnet";
  if (v === "regtest") return "regtest";

  throw new Error(
    `INVALID_BTC_NETWORK: "${raw}" — expected SIGNET, MAINNET, TESTNET, or REGTEST`
  );
}

/** Maps the worker's BtcNetwork to the Prisma btc_network enum string. */
export function prismaBtcNetwork(): string {
  const n = envNetwork();
  if (n === "regtest") return "REGTEST";
  if (n === "signet") return "SIGNET";
  if (n === "testnet") return "TESTNET";
  return "MAINNET";
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

/**
 * Validates all required worker environment variables.
 * Call once at startup in main() before connecting to ZMQ or the database.
 */
export function validateWorkerEnv(): void {
  env("DATABASE_URL");
  env("BTC_RPC_USER");
  env("BTC_RPC_PASSWORD");

  const network = envNetwork(); // throws on missing, invalid, or unconfirmed mainnet
  const rpcUrl = envRpcUrl();
  const zmqTx = envZmqRawTx();
  const zmqBlock = envZmqRawBlock();

  // Validate email config (same rules as web app)
  const emailMode = process.env.AUTH_EMAIL_MODE;
  if (!emailMode) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MISSING_ENV_AUTH_EMAIL_MODE");
    }
    // dev default: console mode — no further checks needed
  } else {
    if (emailMode !== "console" && emailMode !== "live") {
      throw new Error(`INVALID_AUTH_EMAIL_MODE: "${emailMode}" — expected "console" or "live"`);
    }
    if (emailMode === "live") {
      env("ZOHO_SMTP_USER");
      env("ZOHO_SMTP_PASS");
    }
  }

  console.log(
    `[config] network=${network} rpcUrl=${rpcUrl} zmqTx=${zmqTx} zmqBlock=${zmqBlock}`
  );
}

export function envWorkerStatusFile(): string {
  return process.env.WORKER_STATUS_FILE ?? "B:\\BTC_NODE\\run\\worker-status.json";
}