import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "../_lib/auth";

const BodySchema = z.object({
  product_id: z.string().uuid(),
});

function createToken() {
  // token URL-safe
  return crypto.randomBytes(24).toString("base64url");
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = BodySchema.parse(await req.json());

    // ✅ Asegurar que el producto pertenezca al creador
    const product = await prisma.products.findFirst({
      where: { id: body.product_id, creator_id: userId },
      select: { id: true },
    });

    if (!product?.id) {
      return NextResponse.json(
        { success: false, message: "PRODUCT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // ✅ Crear payment link
    const created = await prisma.payment_links.create({
      data: {
        token: createToken(),
        product_id: body.product_id,
        creator_id: userId,
        active: true,
      },
      select: {
        id: true,
        token: true,
        product_id: true,
        active: true,
        created_at: true,
      },
    });

    const origin = new URL(req.url).origin;
    const public_url = `${origin}/p/${created.token}`;

    return NextResponse.json(
      { success: true, data: { ...created, public_url } },
      { status: 201 }
    );
  } catch (err: unknown) {
    const isAuth = err instanceof Error && err.message === "UNAUTHORIZED";
    return NextResponse.json(
      { success: false, message: isAuth ? "UNAUTHORIZED" : "BAD_REQUEST" },
      { status: isAuth ? 401 : 400 }
    );
  }
}
