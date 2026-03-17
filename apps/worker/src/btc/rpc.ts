import { env } from "../env";
import { envRpcUrl } from "../env";

type RpcResponse<T> = { result: T; error: any; id: string };

export async function rpcCall<T>(method: string, params: any[] = []): Promise<T> {
  const url = envRpcUrl();

  const user = env("BTC_RPC_USER");
  const pass = env("BTC_RPC_PASSWORD");

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "worker",
      method,
      params,
    }),
  });

  const json = (await res.json()) as RpcResponse<T>;

  if (!res.ok || json.error) {
    throw new Error(
      `[rpc] ${method} failed: ${JSON.stringify(json.error ?? { status: res.status })}`
    );
  }

  return json.result;
}