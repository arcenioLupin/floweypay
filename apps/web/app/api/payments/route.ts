import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";
import type { PaymentsListResponse } from "@/app/types/paymentTypes";
import {
  buildStatusWhereClause,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  mapRowToPaymentRowVm,
  parseLimitParam,
  parseStatusFilter,
} from "./helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json(
      { success: false, message: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);

  const rawStatus = searchParams.getAll("status").join(",") || null;
  const statusFilter = parseStatusFilter(rawStatus);

  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");
  const from = rawFrom ? new Date(rawFrom) : undefined;
  const to = rawTo ? new Date(rawTo) : undefined;

  const limit = parseLimitParam(searchParams.get("limit"));
  const cursor = searchParams.get("cursor") ?? undefined;

  const now = new Date();

  const rows = await prisma.payments.findMany({
    where: {
      creator_id: userId,
      ...(statusFilter ? buildStatusWhereClause(statusFilter, now) : {}),
      ...(from || to
        ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      created_at: true,
      status: true,
      amount_cents: true,
      currency: true,
      btc_amount_sats: true,
      btc_received_sats: true,
      btc_confirmations: true,
      btc_required_confirmations: true,
      btc_expires_at: true,
      products: { select: { title: true } },
      payment_links: { select: { token: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const items = page.map((r) => mapRowToPaymentRowVm(r, now));

  const body: PaymentsListResponse = { success: true, items, nextCursor };
  return NextResponse.json(body, { status: 200 });
}
