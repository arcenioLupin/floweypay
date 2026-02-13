import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME = "fp_session";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export async function GET() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!raw) {
      return NextResponse.json({ ok: false, message: "No session" }, { status: 401 });
    }

    const tokenHash = hashToken(raw);

    const session = await prisma.sessions.findFirst({
      where: { session_token_hash: tokenHash },
      select: { user_id: true, expires_at: true },
    });

    if (!session) {
      return NextResponse.json({ ok: false, message: "Invalid session" }, { status: 401 });
    }

    if (session.expires_at.getTime() <= Date.now()) {
        await prisma.sessions.deleteMany({ where: { session_token_hash: tokenHash },});
        return NextResponse.json({ ok: false, message: "Session expired" }, { status: 401 });
    }

    const user = await prisma.users.findUnique({
      where: { id: session.user_id },
      select: { id: true, email: true, handle: true, display_name: true, created_at: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, message: "User not found" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, user });
  } catch (err) {
    console.error("me error", err);
    return NextResponse.json({ ok: false, message: "Internal error" }, { status: 500 });
  }
}
