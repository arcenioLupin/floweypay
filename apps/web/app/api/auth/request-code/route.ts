import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { generateOtpCode, hashOtp } from "../../../lib/auth/otp";
import { sendEmail } from "@/app/lib/mail/zoho";
import { otpEmailTemplate } from "@/app/lib/mail/templates/otp";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rateLimit";

const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;

type EmailMode = "console" | "live";

function getEmailMode(): EmailMode {
  const raw = process.env.AUTH_EMAIL_MODE;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MISSING_ENV_AUTH_EMAIL_MODE");
    }
    return "console";
  }
  if (raw === "console") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_EMAIL_MODE=console is not allowed in production. Set AUTH_EMAIL_MODE=live."
      );
    }
    return "console";
  }
  if (raw === "live") return raw;
  throw new Error(`INVALID_AUTH_EMAIL_MODE: "${raw}" — expected "console" or "live"`);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ message: "Invalid email" }, { status: 400 });
    }

    // Rate limiting: IP first, then email — both must pass before any DB work.
    const ip = getClientIp(req);

    const ipRl = checkRateLimit({
      key: `request-code:ip:${ip}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRl.allowed) return rateLimitResponse(ipRl);

    const emailRl = checkRateLimit({
      key: `request-code:email:${email}`,
      limit: 3,
      windowMs: 10 * 60 * 1000,
    });
    if (!emailRl.allowed) return rateLimitResponse(emailRl);

    // 1) Cooldown / idempotencia simple: si ya hay un OTP activo reciente, no generamos otro
    const now = new Date();
    const recent = await prisma.login_codes.findFirst({
      where: {
        email,
        consumed_at: null,
        expires_at: { gt: now },
        created_at: { gt: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000) },
      },
      orderBy: { created_at: "desc" },
    });

    if (recent) {
      return NextResponse.json({ ok: true });
    }

    // Invalidate any previous active OTPs for this email before issuing a new one.
    // Prevents an old partially-attempted code from remaining usable alongside the new one.
    await prisma.login_codes.updateMany({
      where: {
        email,
        consumed_at: null,
        expires_at: { gt: now },
      },
      data: { consumed_at: now },
    });

    const code = generateOtpCode();
    const codeHash = hashOtp(email, code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    const created = await prisma.login_codes.create({
      data: { email, code_hash: codeHash, expires_at: expiresAt },
    });

    const emailMode = getEmailMode();

    if (emailMode === "console") {
      console.log(
        `[FloweyPay OTP] [console mode] email=${email} code=${code} expires=${expiresAt.toISOString()}`
      );
    } else {
      const tpl = otpEmailTemplate({ code, minutesValid: OTP_TTL_MINUTES });
      try {
        await sendEmail({
          to: email,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
      } catch (e) {
        // 2) si no se pudo enviar, revertimos el registro
        await prisma.login_codes.delete({ where: { id: created.id } });
        throw e;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("request-code error", err);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
