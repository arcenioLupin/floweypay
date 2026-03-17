import "dotenv/config";
import * as zmq from "zeromq";
import { envZmqRawTx, envZmqRawBlock } from "./env";
import { refreshWatchlist } from "./watchlist";
import { handleRawTxMessage } from "./handlers/rawtxHandler";
import { handleRawBlockMessage } from "./handlers/rawblockHandler";

async function startRawTxSub(url: string) {
  const sub = new zmq.Subscriber();
  sub.connect(url);
  sub.subscribe("rawtx");
  console.log(`[zmq] subscribed rawtx @ ${url}`);

  for await (const frames of sub) {
    const topic = frames[0]?.toString("utf8") ?? "";
    const payload = frames[1];
    if (topic !== "rawtx" || !payload) continue;

    try {
      await handleRawTxMessage(payload);
    } catch (e) {
      console.warn("[rawtx] handler error:", e);
    }
  }
}

async function startRawBlockSub(url: string) {
  const sub = new zmq.Subscriber();
  sub.connect(url);
  sub.subscribe("rawblock");
  console.log(`[zmq] subscribed rawblock @ ${url}`);

  for await (const frames of sub) {
    const topic = frames[0]?.toString("utf8") ?? "";
    const payload = frames[1];
    if (topic !== "rawblock" || !payload) continue;

    try {
      await handleRawBlockMessage(payload);
    } catch (e) {
      console.warn("[rawblock] handler error:", e);
    }
  }
}

async function main() {
  const urlTx = envZmqRawTx();
  const urlBlock = envZmqRawBlock();

  // watchlist inicial + refresh cada 30s (solo para AWAITING_PAYMENT)
  const n0 = await refreshWatchlist();
  console.log(`[boot] watchlist loaded: ${n0} addresses`);

  const timer = setInterval(async () => {
    try {
      const n = await refreshWatchlist();
      console.log(`[watchlist] refreshed: ${n} addresses`);
    } catch (e) {
      console.warn("[watchlist] refresh failed:", e);
    }
  }, 30_000);

  process.on("SIGINT", async () => {
    console.log("\n[shutdown] stopping...");
    clearInterval(timer);
    process.exit(0);
  });

  // ✅ dos subscribers separados
  await Promise.all([startRawTxSub(urlTx), startRawBlockSub(urlBlock)]);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});