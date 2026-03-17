import { basicAuth, getEnv } from "@/app/helpers/btcRpcHelpers";
import { BlockchainInfo, JsonRpcErr, JsonRpcOk, NetworkInfo } from "@/app/types/nodeBtcTypes";

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

export const getBlockchainInfo = () => btcRpcCall<BlockchainInfo>("getblockchaininfo");
export const getNetworkInfo = () => btcRpcCall<NetworkInfo>("getnetworkinfo");