import { NextResponse } from "next/server";

/**
 * Same-origin enforcement for session-cookie-authenticated, state-changing
 * endpoints. Does not rely solely on SameSite=Lax: validates the Origin header
 * against a trusted, server-side allowlist and inspects Sec-Fetch-Site.
 *
 * Deployment note: a trusted reverse proxy must set/overwrite Origin and
 * Sec-Fetch-* headers; do not trust forwarded values from untrusted peers.
 */

function parseAllowedOrigins(): string[] {
  const raw = process.env.FLOWEYPAY_APP_ORIGIN ?? "";
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { success: false, message: "FORBIDDEN_ORIGIN" },
    { status: 403 }
  );
}

/**
 * Returns a 403 NextResponse if the request fails the same-origin policy,
 * otherwise null. Fails closed in production when the policy cannot be proven.
 */
export function enforceSameOrigin(req: Request): NextResponse | null {
  const isProd = process.env.NODE_ENV === "production";
  const allowed = parseAllowedOrigins();

  // In non-production without explicit config, trust the request's own origin
  // so local dev and tests work; never do this in production.
  const effectiveAllowed =
    allowed.length > 0
      ? allowed
      : isProd
        ? []
        : [new URL(req.url).origin];

  if (effectiveAllowed.length === 0) {
    // Production with no configured origin => cannot prove same-origin.
    return forbidden();
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const normalized = origin.replace(/\/$/, "");
    return effectiveAllowed.includes(normalized) ? null : forbidden();
  }

  // No Origin header: use Sec-Fetch-Site as a secondary signal.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "same-site"
      ? null
      : forbidden();
  }

  // Neither signal present: fail closed in production, allow in dev/tests.
  return isProd ? forbidden() : null;
}
