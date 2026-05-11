import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as zmq from "zeromq";
import { envZmqRawTx, envZmqRawBlock, validateWorkerEnv, envWorkerStatusFile } from "./env";
import { refreshWatchlist } from "./watchlist";
import { expireStalePayments } from "./jobs/expirePayments";
import { handleRawTxMessage } from "./handlers/rawtxHandler";
import { handleRawBlockMessage, getLastBlockHeight } from "./handlers/rawblockHandler";

let lastRawTxAt: Date | null = null;
let lastRawBlockAt: Date | null = null;
let currentWatchlistSize = 0;

function writeHeartbeat(): void {
  try {
    const filePath = envWorkerStatusFile();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      ts: new Date().toISOString(),
      pid: process.pid,
      watchlistSize: currentWatchlistSize,
      lastRawTxAt: lastRawTxAt?.toISOString() ?? null,
      lastRawBlockAt: lastRawBlockAt?.toISOString() ?? null,
      lastBlockHeight: getLastBlockHeight(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (e) {
    console.warn("[heartbeat] failed to write status file:", e);
  }
}

async function startRawTxSub(url: string) {
  const sub = new zmq.Subscriber();
  sub.connect(url);
  sub.subscribe("rawtx");
  console.log(`[zmq] subscribed rawtx @ ${url}`);

  for await (const frames of sub) {
    const topic = frames[0]?.toString("utf8") ?? "";
    const payload = frames[1];
    if (topic !== "rawtx" || !payload) continue;

    lastRawTxAt = new Date();
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

    lastRawBlockAt = new Date();
    try {
      await handleRawBlockMessage(payload);
    } catch (e) {
      console.warn("[rawblock] handler error:", e);
    }
  }
}

async function main() {
  validateWorkerEnv();

  const urlTx = envZmqRawTx();
  const urlBlock = envZmqRawBlock();

  // boot: expire stale payments first, then load watchlist
  const expired0 = await expireStalePayments();
  if (expired0 > 0) console.log(`[boot] expired ${expired0} stale payments`);

  const n0 = await refreshWatchlist();
  currentWatchlistSize = n0;
  console.log(`[boot] watchlist loaded: ${n0} addresses`);

  const timer = setInterval(async () => {
    try {
      await expireStalePayments();
    } catch (e) {
      console.warn("[expire] job failed:", e);
    }
    try {
      const n = await refreshWatchlist();
      currentWatchlistSize = n;
      console.log(`[watchlist] refreshed: ${n} addresses`);
    } catch (e) {
      console.warn("[watchlist] refresh failed:", e);
    }
    writeHeartbeat();
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