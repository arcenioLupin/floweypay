export type BtcNetwork = "main" | "signet" | "testnet" | "regtest";

export type TxOutput = { address: string; valueSats: bigint };
export type DecodedRawTx = { txid: string; outputs: TxOutput[] };
