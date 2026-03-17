export type BlockchainInfo = {
  chain: string;
  blocks: number;
  headers: number;
  verificationprogress: number;
  initialblockdownload: boolean;
  bestblockhash: string;
};

export type NetworkInfo = {
  version: number;
  subversion: string;
  protocolversion: number;
  networkactive: boolean;
  connections: number;
  connections_in: number;
  connections_out: number;
};

export type JsonRpcOk<T> = { result: T; error: null; id: string };
export type JsonRpcErr = { result: null; error: { code: number; message: string }; id: string };