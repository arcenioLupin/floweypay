/**
 * Boot-time validation for web app environment.
 * Called once on module load from btcConfig.ts.
 * Throws a clear error immediately in production if critical config is missing or invalid.
 */

let validated = false;

export function validateWebEnv(): void {
  if (validated) return;
  validated = true;

  const isProd = process.env.NODE_ENV === "production";

  // Always required
  if (!process.env.DATABASE_URL) {
    throw new Error("MISSING_ENV_DATABASE_URL");
  }

  if (!isProd) return;

  // Production-only checks
  if (!process.env.AUTH_OTP_SECRET) {
    throw new Error("MISSING_ENV_AUTH_OTP_SECRET");
  }

  const emailMode = process.env.AUTH_EMAIL_MODE;
  if (!emailMode) {
    throw new Error("MISSING_ENV_AUTH_EMAIL_MODE");
  }
  if (emailMode !== "console" && emailMode !== "live") {
    throw new Error(
      `INVALID_AUTH_EMAIL_MODE: "${emailMode}" — expected "console" or "live"`
    );
  }

  // console mode prints OTPs to stdout — never acceptable in production.
  if (emailMode === "console") {
    throw new Error(
      "AUTH_EMAIL_MODE=console is not allowed in production. Set AUTH_EMAIL_MODE=live."
    );
  }

  if (emailMode === "live") {
    if (!process.env.ZOHO_SMTP_USER) throw new Error("MISSING_ENV_ZOHO_SMTP_USER");
    if (!process.env.ZOHO_SMTP_PASS) throw new Error("MISSING_ENV_ZOHO_SMTP_PASS");
  }

  const addressSource = process.env.BTC_ADDRESS_SOURCE;
  if (addressSource === "rpc") {
    if (!process.env.BTC_RPC_URL)      throw new Error("MISSING_ENV_BTC_RPC_URL");
    if (!process.env.BTC_RPC_USER)     throw new Error("MISSING_ENV_BTC_RPC_USER");
    if (!process.env.BTC_RPC_PASSWORD) throw new Error("MISSING_ENV_BTC_RPC_PASSWORD");
    if (!process.env.BTC_RPC_WALLET)   throw new Error("MISSING_ENV_BTC_RPC_WALLET");
  }
}
