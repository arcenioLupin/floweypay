import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as zmq from "zeromq";
import { envZmqRawTx, envZmqRawBlock, validateWorkerEnv, envWorkerStatusFile } from "./env";
import { refreshWatchlist } from "./watchlist";
import { expireStalePayments } from "./jobs/expirePayments";
import { handleRawTxMessage } from "./handlers/rawtxHandler";
import { handleRawBlockMessage, getLastBlockHeight } from "./handlers/rawblockHandler";
import { sendPendingNotifications } from "./notifications/sendNotifications";

// ── Per-message state ───────────────────────────────────────────────────────
let lastRawTxAt: Date | null = null;
let lastRawBlockAt: Date | null = null;
let currentWatchlistSize = 0;

// ── Subscriber health (for heartbeat) ──────────────────────────────────────
let zmqRawTxConnected = false;
let zmqRawBlockConnected = false;
const rawTxReconnects = { count: 0 };
const rawBlockReconnects = { count: 0 };

// ── Active socket refs (for graceful shutdown) ─────────────────────────────
let rawTxSubRef: zmq.Subscriber | null = null;
let rawBlockSubRef: zmq.Subscriber | null = null;

// ── Reconnect constants ─────────────────────────────────────────────────────
const MAX_RECONNECT_ATTEMPTS = 10;
const MIN_STABLE_MS = 5_000;

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(Math.pow(2, attempt - 1) * 1_000, 30_000);
  const jitter = 0.8 + 0.4 * Math.random();
  return Math.round(base * jitter);
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
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
      zmqRawTxConnected,
      zmqRawBlockConnected,
      zmqRawTxReconnects: rawTxReconnects.count,
      zmqRawBlockReconnects: rawBlockReconnects.count,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (e) {
    console.warn("[heartbeat] failed to write status file:", e);
  }
}

// ── Single-attempt subscriber functions ────────────────────────────────────
// Each function runs until the socket closes or throws.
// Reconnect logic lives in runWithReconnect — not here.

async function startRawTxSub(url: string): Promise<void> {
  const sub = new zmq.Subscriber();
  rawTxSubRef = sub;
  zmqRawTxConnected = true;
  try {
    sub.connect(url);
    sub.subscribe("rawtx");
    console.log(`[zmq][rawtx] subscriber started @ ${url}`);

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
  } finally {
    zmqRawTxConnected = false;
    rawTxSubRef = null;
    try { sub.close(); } catch { /* ignore */ }
  }
}

async function startRawBlockSub(url: string): Promise<void> {
  const sub = new zmq.Subscriber();
  rawBlockSubRef = sub;
  zmqRawBlockConnected = true;
  try {
    sub.connect(url);
    sub.subscribe("rawblock");
    console.log(`[zmq][rawblock] subscriber started @ ${url}`);

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
  } finally {
    zmqRawBlockConnected = false;
    rawBlockSubRef = null;
    try { sub.close(); } catch { /* ignore */ }
  }
}

// ── Reconnect wrapper ───────────────────────────────────────────────────────
// Runs attemptFn in a loop, reconnecting on exit or throw.
// Each subscriber runs its own independent instance — a failure in one
// does not affect the other.

async function runWithReconnect(
  name: string,
  url: string,
  attemptFn: (url: string) => Promise<void>,
  stopped: { value: boolean },
  reconnectsRef: { count: number },
): Promise<void> {
  let consecutiveFails = 0;

  while (!stopped.value) {
    const startedAt = Date.now();

    try {
      await attemptFn(url);
      if (!stopped.value) {
        console.warn(`[zmq][${name}] subscriber loop exited`);
      }
    } catch (e) {
      if (stopped.value) break;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[zmq][${name}] subscriber error: ${msg}`);
    }

    if (stopped.value) {
      console.log(`[zmq][${name}] subscriber closed`);
      break;
    }

    const ranForMs = Date.now() - startedAt;
    if (ranForMs >= MIN_STABLE_MS) {
      if (consecutiveFails > 0) {
        console.log(`[zmq][${name}] subscriber recovered after reconnect`);
      }
      consecutiveFails = 0;
    } else {
      consecutiveFails++;
    }

    if (consecutiveFails >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[zmq][${name}] too many consecutive failures (${consecutiveFails}/${MAX_RECONNECT_ATTEMPTS}) — fatal exit`,
      );
      process.exit(1);
    }

    const delay = backoffMs(consecutiveFails);
    console.log(
      `[zmq][${name}] reconnecting in ${delay}ms (attempt ${consecutiveFails} of ${MAX_RECONNECT_ATTEMPTS})`,
    );
    reconnectsRef.count++;
    await sleep(delay);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
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

  const stopped = { value: false };

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
    try {
      await sendPendingNotifications();
    } catch (e) {
      console.warn("[notifications] dispatch failed:", e);
    }
    writeHeartbeat();
  }, 30_000);

  function shutdown(signal: string): void {
    console.log(`\n[shutdown] ${signal} received — stopping...`);
    stopped.value = true;
    clearInterval(timer);
    // Close active sockets so the for-await loops exit immediately.
    if (rawTxSubRef) { try { rawTxSubRef.close(); } catch { /* ignore */ } }
    if (rawBlockSubRef) { try { rawBlockSubRef.close(); } catch { /* ignore */ } }
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await Promise.all([
    runWithReconnect("rawtx",   urlTx,   startRawTxSub,   stopped, rawTxReconnects),
    runWithReconnect("rawblock", urlBlock, startRawBlockSub, stopped, rawBlockReconnects),
  ]);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});