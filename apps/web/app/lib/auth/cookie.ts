/** Single source of truth for the session cookie name. Reads FLOWEYPAY_SESSION_COOKIE env var. */
export const SESSION_COOKIE_NAME =
  process.env.FLOWEYPAY_SESSION_COOKIE ?? "fp_session";
