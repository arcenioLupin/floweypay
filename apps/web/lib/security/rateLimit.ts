/**
 * In-memory fixed-window rate limiter.
 *
 * CAVEATS — acceptable for single-host MVP only:
 *   • State lives in this Node.js process and is lost on every restart or
 *     deployment. A process restart clears all counters, allowing a burst
 *     immediately afterwards.
 *   • Not distributed. Running multiple Next.js instances (PM2 cluster,
 *     horizontal scaling) gives each instance its own independent store —
 *     the effective per-IP limit is multiplied by the number of instances.
 *   • IP-based limiting can be bypassed if no trusted reverse proxy sits in
 *     front: a client can forge the x-forwarded-for header.  Ensure Nginx /
 *     Caddy overwrites (does not appends) the header with the real peer IP.
 *   • Migrate to a shared store (Redis / Upstash) before horizontal scaling.
 */

import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface CheckRateLimitInput {
  /** Unique key for this bucket, e.g. "request-code:ip:1.2.3.4" */
  key: string;
  /** Maximum requests allowed within the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

// ─── Internal store ───────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  /** Unix ms timestamp at which this window expires */
  windowEnd: number;
}

const store = new Map<string, Bucket>();

// ─── Periodic GC ─────────────────────────────────────────────────────────────

function purgeExpiredBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (now >= bucket.windowEnd) {
      store.delete(key);
    }
  }
}

// Run GC every 5 minutes to prevent unbounded Map growth.
// The runtime check for unref() keeps this compatible with both Node.js
// (where setInterval returns a NodeJS.Timeout object) and edge/browser
// environments (where it returns a number).
{
  const timer = setInterval(purgeExpiredBuckets, 5 * 60 * 1000);
  if (
    typeof timer === "object" &&
    timer !== null &&
    typeof (timer as { unref?: unknown }).unref === "function"
  ) {
    (timer as { unref(): void }).unref();
  }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Check (and atomically increment) a rate limit bucket.
 *
 * This function is synchronous and relies solely on the JS event loop's
 * single-threaded nature — no async I/O is involved, so no race conditions
 * exist within a single Node.js process.
 */
export function checkRateLimit({
  key,
  limit,
  windowMs,
}: CheckRateLimitInput): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (existing !== undefined && now < existing.windowEnd) {
    // Bucket exists and is still within its window.
    if (existing.count >= limit) {
      const retryAfterMs = existing.windowEnd - now;
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: new Date(existing.windowEnd),
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      limit,
      remaining: limit - existing.count,
      resetAt: new Date(existing.windowEnd),
      retryAfterSeconds: 0,
    };
  }

  // No bucket or the previous window has expired — start a fresh window.
  const windowEnd = now + windowMs;
  store.set(key, { count: 1, windowEnd });
  return {
    allowed: true,
    limit,
    remaining: limit - 1,
    resetAt: new Date(windowEnd),
    retryAfterSeconds: 0,
  };
}

// ─── IP extraction ────────────────────────────────────────────────────────────

/**
 * Extract the real client IP from request headers.
 *
 * Precedence:
 *   1. x-forwarded-for — leftmost (originating) address set by a reverse proxy.
 *   2. x-real-ip       — single-IP header set by Nginx.
 *   3. "unknown"       — never returns null or empty string; prevents all
 *                        header-less requests from sharing a single bucket.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }

  const xri = req.headers.get("x-real-ip");
  if (xri) {
    const trimmed = xri.trim();
    if (trimmed) return trimmed;
  }

  return "unknown";
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Build a 429 NextResponse with the standardised body and rate limit headers.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const res = NextResponse.json(
    { message: "Too many requests. Please try again later." },
    { status: 429 }
  );
  setRateLimitHeaders(res, result);
  return res;
}

/**
 * Attach X-RateLimit-* and Retry-After headers to an existing response.
 * Call this on successful (allowed) responses so well-behaved clients can
 * self-throttle before reaching the limit.
 */
export function setRateLimitHeaders(
  res: NextResponse,
  result: RateLimitResult
): void {
  res.headers.set("Retry-After", String(result.retryAfterSeconds));
  res.headers.set("X-RateLimit-Limit", String(result.limit));
  res.headers.set("X-RateLimit-Remaining", String(result.remaining));
  res.headers.set(
    "X-RateLimit-Reset",
    String(Math.floor(result.resetAt.getTime() / 1000))
  );
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Wipe the entire rate limit store.
 * For use in automated tests only — never call from application code.
 */
export function clearRateLimitStoreForTests(): void {
  store.clear();
}
