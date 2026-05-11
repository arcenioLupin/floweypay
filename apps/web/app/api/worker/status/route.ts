// apps/web/app/api/worker/status/route.ts
import { NextResponse } from "next/server";
import * as fs from "fs";

export const runtime = "nodejs";

const DEFAULT_STATUS_FILE = "B:\\BTC_NODE\\run\\worker-status.json";
const STALE_THRESHOLD_SECONDS = 120;
const WATCHLIST_HIGH_THRESHOLD = 500;

type WorkerStatusPayload = {
  ts: string;
  pid: number;
  watchlistSize: number;
  lastRawTxAt: string | null;
  lastRawBlockAt: string | null;
  lastBlockHeight: number | null;
};

export async function GET() {
  const filePath = process.env.WORKER_STATUS_FILE ?? DEFAULT_STATUS_FILE;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return NextResponse.json(
      { ok: false, reason: "STATUS_FILE_MISSING" },
      { status: 503 }
    );
  }

  let parsed: WorkerStatusPayload;
  try {
    parsed = JSON.parse(raw) as WorkerStatusPayload;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "STATUS_FILE_MALFORMED" },
      { status: 503 }
    );
  }

  const nowMs = Date.now();
  const tsMs = new Date(parsed.ts).getTime();
  const staleSeconds = Math.floor((nowMs - tsMs) / 1000);
  const stale = staleSeconds > STALE_THRESHOLD_SECONDS;

  const watchlistBacklogLevel: "normal" | "high" =
    parsed.watchlistSize > WATCHLIST_HIGH_THRESHOLD ? "high" : "normal";

  return NextResponse.json(
    {
      ok: !stale,
      staleSeconds,
      stale,
      pid: parsed.pid,
      watchlistSize: parsed.watchlistSize,
      watchlistBacklogLevel,
      lastRawTxAt: parsed.lastRawTxAt,
      lastRawBlockAt: parsed.lastRawBlockAt,
      lastBlockHeight: parsed.lastBlockHeight,
      workerTs: parsed.ts,
    },
    { status: stale ? 503 : 200 }
  );
}
