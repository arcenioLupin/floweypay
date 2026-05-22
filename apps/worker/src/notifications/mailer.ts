import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailOpts {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type EmailMode = "console" | "live";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`MISSING_ENV_${name}`);
  return v;
}

function getEmailMode(): EmailMode {
  const raw = process.env.AUTH_EMAIL_MODE;

  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MISSING_ENV_AUTH_EMAIL_MODE");
    }
    return "console";
  }

  if (raw === "console" || raw === "live") return raw;
  throw new Error(`INVALID_AUTH_EMAIL_MODE: "${raw}" — expected "console" or "live"`);
}

function createZohoTransport() {
  const host = process.env.ZOHO_SMTP_HOST ?? "smtp.zoho.com";
  const port = Number(process.env.ZOHO_SMTP_PORT ?? "587");
  const secure = (process.env.ZOHO_SMTP_SECURE ?? "false") === "true";
  const user = requireEnv("ZOHO_SMTP_USER");
  const pass = requireEnv("ZOHO_SMTP_PASS");

  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a transactional email.
 *
 * Console mode  — logs to stdout; no SMTP call is made.
 * Live mode     — sends via Zoho SMTP using nodemailer.
 *
 * Throws on failure so the caller can decide how to handle retries.
 */
export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const mode = getEmailMode();

  if (mode === "console") {
    console.log(
      `[mailer] console mode | to=${opts.to} | subject="${opts.subject}"\n` +
      `[mailer] body: ${opts.text}`
    );
    return;
  }

  const fromName  = process.env.ZOHO_FROM_NAME  ?? "FloweyPay";
  const fromEmail = process.env.ZOHO_FROM_EMAIL ?? requireEnv("ZOHO_SMTP_USER");

  const transporter = createZohoTransport();

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to:      opts.to,
    subject: opts.subject,
    text:    opts.text,
    html:    opts.html,
  });
}
