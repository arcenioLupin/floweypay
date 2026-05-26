import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";
import { payment_method, payment_status } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = [
  payment_status.AWAITING_PAYMENT,
  payment_status.SEEN_IN_MEMPOOL,
  payment_status.CONFIRMING,
] as const;

function parseDateParam(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

function buildDateFilter(from: Date | undefined, to: Date | undefined) {
  if (!from && !to) return {};
  return {
    created_at: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

export type DashboardStats = {
  confirmedPaymentsCount: number;
  confirmedRevenueCents: number;
  confirmedBtcReceivedSats: string;
  activeInvoicesCount: number;
  expiredPaymentsCount: number;
  failedPaymentsCount: number;
  totalStarted: number;
  conversionRate: number;
};

export type DashboardStatsResponse = {
  success: true;
  stats: DashboardStats;
};

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
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"));
  const dateFilter = buildDateFilter(from, to);
  const now = new Date();

  const baseWhere = {
    creator_id: userId,
    method: payment_method.BTC_ONCHAIN,
    ...dateFilter,
  };

  const [confirmed, active, expiredDb, expiredVirtual, failed] =
    await Promise.all([
      prisma.payments.aggregate({
        where: { ...baseWhere, status: payment_status.CONFIRMED },
        _count: { id: true },
        _sum: { amount_cents: true, btc_received_sats: true },
      }),
      prisma.payments.count({
        where: {
          ...baseWhere,
          status: { in: [...ACTIVE_STATUSES] },
          OR: [{ btc_expires_at: null }, { btc_expires_at: { gt: now } }],
        },
      }),
      prisma.payments.count({
        where: { ...baseWhere, status: payment_status.EXPIRED },
      }),
      prisma.payments.count({
        where: {
          ...baseWhere,
          status: { in: [...ACTIVE_STATUSES] },
          btc_expires_at: { lte: now },
        },
      }),
      prisma.payments.count({
        where: { ...baseWhere, status: payment_status.FAILED },
      }),
    ]);

  const confirmedCount = confirmed._count.id;
  const expiredCount = expiredDb + expiredVirtual;
  const totalStarted = confirmedCount + active + expiredCount + failed;
  const conversionRate =
    totalStarted > 0 ? confirmedCount / totalStarted : 0;

  const body: DashboardStatsResponse = {
    success: true,
    stats: {
      confirmedPaymentsCount: confirmedCount,
      confirmedRevenueCents: confirmed._sum.amount_cents ?? 0,
      confirmedBtcReceivedSats: (
        confirmed._sum.btc_received_sats ?? 0n
      ).toString(),
      activeInvoicesCount: active,
      expiredPaymentsCount: expiredCount,
      failedPaymentsCount: failed,
      totalStarted,
      conversionRate,
    },
  };

  return NextResponse.json(body, { status: 200 });
}
