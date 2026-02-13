import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";
import { hashOtp } from "../../../lib/auth/otp";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiresAt,
} from "../../../lib/auth/session";

const OTP_MAX_AGE_MINUTES = 10;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();

    if (!email || !email.includes("@") || !code) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    // 1) Buscar el último OTP no consumido (por email)
    const latest = await prisma.login_codes.findFirst({
      where: {
        email,
        consumed_at: null,
      },
      orderBy: { created_at: "desc" },
    });

    if (!latest) {
      return NextResponse.json({ message: "Code not found" }, { status: 400 });
    }

    // 2) Validar expiración
    const now = new Date();
    if (latest.expires_at <= now) {
      return NextResponse.json({ message: "Code expired" }, { status: 400 });
    }

    // 3) Validar hash OTP
    const expectedHash = hashOtp(email, code);
    if (expectedHash !== latest.code_hash) {
      return NextResponse.json({ message: "Invalid code" }, { status: 400 });
    }

    // 4) Consumir OTP (idempotencia simple)
    await prisma.login_codes.update({
      where: { id: latest.id },
      data: { consumed_at: now },
    });

    // (Opcional) Limpiar OTPs expirados del mismo email
    await prisma.login_codes.deleteMany({
    where: {
        email,
        expires_at: { lt: new Date() },
    },
    });

    // 5) Upsert user
    const user = await prisma.users.upsert({
      where: { email },
      update: {},
      create: {
        email,
        handle: email.split("@")[0], // por ahora simple, luego lo hacemos bien
      },
    });

    // 6) Crear sesión (token en claro solo para cookie; en DB guardamos hash)
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = sessionExpiresAt();

    await prisma.sessions.create({
      data: {
        user_id: user.id,
        session_token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    // 7) Set cookie httpOnly
    const isProd = process.env.NODE_ENV === "production";

    const cookiesStore = await cookies();
    cookiesStore.set({
      name: "fp_session",
      value: token,
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error("verify-code error", err);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
