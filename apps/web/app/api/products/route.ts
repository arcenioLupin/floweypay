import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "../_lib/auth";

const BodySchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: z.string().min(3).max(10),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = BodySchema.parse(await req.json());

    const product = await prisma.products.create({
      data: {
        creator_id: userId,
        title: body.title,
        message: body.message,
        amount_cents: body.amount_cents,
        currency: body.currency.toUpperCase(),
        metadata_json: (body.metadata as Prisma.InputJsonValue) ?? undefined,
        active: true,
      },
      select: {
        id: true,
        title: true,
        message: true,
        amount_cents: true,
        currency: true,
        metadata_json: true,
        active: true,
        created_at: true,
      },
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
} catch (err: unknown) {
    const isAuth = err instanceof Error && err.message === "UNAUTHORIZED";

    return NextResponse.json(
        { success: false, message: isAuth ? "UNAUTHORIZED" : "BAD_REQUEST" },
        { status: isAuth ? 401 : 400 }
    );
    }

}
