export type BtcNetwork = "main" | "signet" | "testnet" | "regtest";

export type TxOutput = { address: string; valueSats: bigint; voutIndex: number };
export type DecodedRawTx = { txid: string; outputs: TxOutput[] };
