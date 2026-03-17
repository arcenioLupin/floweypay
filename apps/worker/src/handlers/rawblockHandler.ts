import { prisma } from "../prisma";
import { envNetwork } from "../env";
import { rpcCall } from "../btc/rpc";

function prismaBtcNetwork() {
  const n = (envNetwork() ?? "").toLowerCase();
  if (n === "regtest") return "REGTEST";
  if (n === "signet") return "SIGNET";
  if (n === "testnet") return "TESTNET";
  return "MAINNET";
}

type GetBlockVerbosity1 = {
  hash: string;
  height: number;
  tx: string[]; // txids
};

let isHandling = false;
let lastBestHash: string | null = null;

export async function handleRawBlockMessage(_payload: Buffer) {
  // Evitar doble procesamiento si llegan eventos muy seguidos
  if (isHandling) return;
  isHandling = true;

  try {
    const bestHash = await rpcCall<string>("getbestblockhash");
    if (bestHash === lastBestHash) return;
    lastBestHash = bestHash;

    const block = await rpcCall<GetBlockVerbosity1>("getblock", [bestHash, 1]);
    const txSet = new Set(block.tx);

    const net = prismaBtcNetwork();

    // Traemos los payments BTC que ya tienen txid y están en proceso
    const rows = await prisma.payments.findMany({
      where: {
        method: "BTC_ONCHAIN",
        btc_network: net as any,
        btc_txid: { not: null },
        status: { in: ["SEEN_IN_MEMPOOL", "CONFIRMING"] as any },
      },
      select: {
        id: true,
        status: true,
        btc_txid: true,
        btc_confirmations: true,
        btc_required_confirmations: true,
      },
      take: 5000,
    });

    let updated = 0;

    for (const p of rows) {
      const txid = p.btc_txid!;
      const required = p.btc_required_confirmations ?? 1;

      // Caso 1: estaba en mempool y ahora aparece en el bloque => 1 confirmación
      if (p.status === "SEEN_IN_MEMPOOL") {
        if (!txSet.has(txid)) continue;

        const conf = 1;
        const newStatus = conf >= required ? "CONFIRMED" : "CONFIRMING";

        await prisma.payments.update({
          where: { id: p.id },
          data: {
            btc_confirmations: conf,
            status: newStatus as any,
          },
        });

        updated++;
        continue;
      }

      // Caso 2: ya estaba CONFIRMING => cada bloque suma 1 confirmación (en REGTEST sin reorgs está ok)
      if (p.status === "CONFIRMING") {
        const conf = (p.btc_confirmations ?? 0) + 1;
        const newStatus = conf >= required ? "CONFIRMED" : "CONFIRMING";

        await prisma.payments.update({
          where: { id: p.id },
          data: {
            btc_confirmations: conf,
            status: newStatus as any,
          },
        });

        updated++;
      }
    }

    console.log(
      `[block] height=${block.height} txs=${block.tx.length} updated=${updated} net=${net}`
    );
  } finally {
    isHandling = false;
  }
}