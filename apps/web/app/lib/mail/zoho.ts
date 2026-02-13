import nodemailer from "nodemailer";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function createZohoTransport() {
  const host = process.env.ZOHO_SMTP_HOST ?? "smtp.zoho.com";
  const port = Number(process.env.ZOHO_SMTP_PORT ?? "587");
  const secure = (process.env.ZOHO_SMTP_SECURE ?? "false") === "true";

  const user = requireEnv("ZOHO_SMTP_USER");
  const pass = requireEnv("ZOHO_SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }) {
  const transporter = createZohoTransport();

  const fromName = process.env.ZOHO_FROM_NAME ?? "FloweyPay";
  const fromEmail = process.env.ZOHO_FROM_EMAIL ?? requireEnv("ZOHO_SMTP_USER");

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
