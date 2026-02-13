import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";
import { hashSessionToken } from "../../../lib/auth/session";

const SESSION_COOKIE = "fp_session"; // usa el mismo nombre exacto que setea verify-code

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  // respuesta OK siempre (logout idempotente)
  const res = NextResponse.json({ ok: true });

  // borrar cookie
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  // si hay token, borrar sesión en DB
  if (token) {
    const tokenHash = hashSessionToken(token);

    await prisma.sessions.deleteMany({
      where: { session_token_hash: tokenHash },
    });
  }

  return res;
}
