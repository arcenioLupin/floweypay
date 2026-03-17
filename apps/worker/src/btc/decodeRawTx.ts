import * as bitcoin from "bitcoinjs-lib";
import { envNetwork } from "../env";
import { DecodedRawTx, TxOutput } from "../types/btcNetWorkTypes";

function btcjsNetwork() {
  const n = (envNetwork() ?? "").toLowerCase();

  // ✅ REGTEST debe usar networks.regtest para que salga bcrt1...
  if (n === "regtest") return bitcoin.networks.regtest;

  // Signet usa el mismo formato de direcciones que testnet (tb1...)
  if (n === "signet" || n === "testnet") return bitcoin.networks.testnet;

  return bitcoin.networks.bitcoin;
}

export function decodeRawTx(payload: Buffer): DecodedRawTx {
  const tx = bitcoin.Transaction.fromBuffer(payload);
  const txid = tx.getId();

  const net = btcjsNetwork();
  const outputs: TxOutput[] = [];

  for (const out of tx.outs) {
    try {
      const address = bitcoin.address.fromOutputScript(out.script, net);
      // out.value es number (sats) en bitcoinjs-lib
      outputs.push({ address, valueSats: BigInt(out.value) });
    } catch {
      // output no estándar -> ignorar
    }
  }

  return { txid, outputs };
}