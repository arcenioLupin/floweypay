import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";
import { hashOtp } from "../../../lib/auth/otp";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiresAt,
} from "../../../lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/app/lib/auth/cookie";

const MAX_OTP_ATTEMPTS = 5;
const INVALID_CODE_MSG = "Invalid or expired code";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();

    if (!email || !email.includes("@") || !code) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    // Rate limiting: IP first, then email — both must pass before any DB work.
    const ip = getClientIp(req);

    const ipRl = checkRateLimit({
      key: `verify-code:ip:${ip}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRl.allowed) return rateLimitResponse(ipRl);

    const emailRl = checkRateLimit({
      key: `verify-code:email:${email}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!emailRl.allowed) return rateLimitResponse(emailRl);

    const now = new Date();

    // 1) Find the latest active (not consumed, not expired) OTP for this email
    const latest = await prisma.login_codes.findFirst({
      where: {
        email,
        consumed_at: null,
        expires_at: { gt: now },
      },
      orderBy: { created_at: "desc" },
    });

    if (!latest) {
      return NextResponse.json({ message: INVALID_CODE_MSG }, { status: 400 });
    }

    // 2) Check attempt limit before evaluating the code
    if (latest.attempts >= MAX_OTP_ATTEMPTS) {
      return NextResponse.json({ message: INVALID_CODE_MSG }, { status: 400 });
    }

    // 3) Validate code hash — increment attempts atomically on mismatch
    const expectedHash = hashOtp(email, code);
    if (expectedHash !== latest.code_hash) {
      await prisma.login_codes.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ message: INVALID_CODE_MSG }, { status: 400 });
    }

    // 4) Consume OTP — optimistic lock: only succeeds if the row is still unconsumed.
    //    Guards against double-session creation on concurrent correct-code requests.
    const { count } = await prisma.login_codes.updateMany({
      where: { id: latest.id, consumed_at: null },
      data: { consumed_at: now },
    });

    if (count === 0) {
      // Another concurrent request already consumed this code
      return NextResponse.json({ message: INVALID_CODE_MSG }, { status: 400 });
    }

    // Clean up expired OTPs for this email (best-effort; failure must not break login)
    try {
      await prisma.login_codes.deleteMany({
        where: { email, expires_at: { lt: now } },
      });
    } catch {
      // Non-critical — ignore
    }

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
      name: SESSION_COOKIE_NAME,
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
