import { basicAuth, getEnv } from "@/app/helpers/btcRpcHelpers";
import { BlockchainInfo, JsonRpcErr, JsonRpcOk, NetworkInfo } from "@/app/types/nodeBtcTypes";

function trimTrailingSlash(raw: string): string {
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function getWalletRpcUrl(): string {
  const baseUrl = trimTrailingSlash(getEnv("BTC_RPC_URL"));
  const wallet = getEnv("BTC_RPC_WALLET");
  return `${baseUrl}/wallet/${encodeURIComponent(wallet)}`;
}

export async function btcRpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const url = getEnv("BTC_RPC_URL");
  const user = getEnv("BTC_RPC_USER");
  const pass = getEnv("BTC_RPC_PASSWORD");

  const body = {
    jsonrpc: "1.0",
    id: "floweypay",
    method,
    params,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth(user, pass)}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as (JsonRpcOk<T> | JsonRpcErr) | null;

  if (!res.ok || !json) throw new Error("BTC_RPC_HTTP_ERROR");
  if (json.error) throw new Error(`BTC_RPC_${json.error.code}_${json.error.message}`);

  return json.result;
}

export async function btcWalletRpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const walletUrl = getWalletRpcUrl();
  const user = getEnv("BTC_RPC_USER");
  const pass = getEnv("BTC_RPC_PASSWORD");

  const body = {
    jsonrpc: "1.0",
    id: "floweypay",
    method,
    params,
  };

  const res = await fetch(walletUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth(user, pass)}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as (JsonRpcOk<T> | JsonRpcErr) | null;

  if (!res.ok || !json) throw new Error("BTC_RPC_HTTP_ERROR");
  if (json.error) throw new Error(`BTC_RPC_${json.error.code}_${json.error.message}`);

  return json.result;
}

export function getNewInvoiceAddress(): Promise<string> {
  return btcWalletRpcCall<string>("getnewaddress", ["invoice", "bech32"]);
}

export const getBlockchainInfo = () => btcRpcCall<BlockchainInfo>("getblockchaininfo");
export const getNetworkInfo = () => btcRpcCall<NetworkInfo>("getnetworkinfo");