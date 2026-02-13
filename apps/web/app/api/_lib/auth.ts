import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/app/lib/prisma";

const SESSION_COOKIE = process.env.FLOWEYPAY_SESSION_COOKIE ?? "fp_session";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function requireUserId(): Promise<string> {
  const cookieStore = await cookies(); // ✅ aquí el fix
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) throw new Error("UNAUTHORIZED");

  const tokenHash = sha256Hex(token);
  const now = new Date();

  const session = await prisma.sessions.findFirst({
    where: {
      session_token_hash: tokenHash,
      expires_at: { gt: now },
    },
    select: { user_id: true },
  });

  if (!session?.user_id) throw new Error("UNAUTHORIZED");
  return session.user_id;
}
