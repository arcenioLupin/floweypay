import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { generateOtpCode, hashOtp } from "../../../lib/auth/otp";
import { sendEmail } from "@/app/lib/mail/zoho";
import { otpEmailTemplate } from "@/app/lib/mail/templates/otp";

const OTP_TTL_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ message: "Invalid email" }, { status: 400 });
    }

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

    const code = generateOtpCode();
    const codeHash = hashOtp(email, code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    const created = await prisma.login_codes.create({
      data: { email, code_hash: codeHash, expires_at: expiresAt },
    });

    console.log(`[FloweyPay OTP] email=${email} expires=${expiresAt.toISOString()}`);

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("request-code error", err);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
