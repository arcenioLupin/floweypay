import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function parseDateParam(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

// Raw shape returned by $queryRaw — all casted to text in SQL to avoid
// BigInt serialization issues.
type RawDayRow = {
  date: string;
  confirmedPaymentsCount: string;
  confirmedRevenueCents: string;
  confirmedBtcReceivedSats: string;
};

export type DailyChartRow = {
  date: string;
  confirmedPaymentsCount: number;
  confirmedRevenueCents: number;
  confirmedBtcReceivedSats: string;
};

export type DailyChartResponse = {
  success: true;
  days: DailyChartRow[];
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

  // Conditional SQL fragments — Prisma.empty is a no-op fragment.
  const fromClause = from
    ? Prisma.sql`AND created_at >= ${from}`
    : Prisma.empty;
  const toClause = to
    ? Prisma.sql`AND created_at <= ${to}`
    : Prisma.empty;

  // $queryRaw is required here because Prisma's fluent API has no support
  // for date-bucketing (date_trunc + GROUP BY date).
  // All aggregates are cast to ::text to prevent BigInt serialization errors.
  const rows = await prisma.$queryRaw<RawDayRow[]>`
    SELECT
      TO_CHAR(date_trunc('day', created_at), 'YYYY-MM-DD') AS "date",
      COUNT(*)::text                                        AS "confirmedPaymentsCount",
      COALESCE(SUM(amount_cents), 0)::text                  AS "confirmedRevenueCents",
      COALESCE(SUM(btc_received_sats), 0)::text             AS "confirmedBtcReceivedSats"
    FROM payments
    WHERE
      creator_id = ${userId}::uuid
      AND method = 'BTC_ONCHAIN'::payment_method
      AND status = 'CONFIRMED'::payment_status
      ${fromClause}
      ${toClause}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const days: DailyChartRow[] = rows.map((r) => ({
    date: r.date,
    confirmedPaymentsCount: Number(r.confirmedPaymentsCount),
    confirmedRevenueCents: Number(r.confirmedRevenueCents),
    confirmedBtcReceivedSats: r.confirmedBtcReceivedSats,
  }));

  const body: DailyChartResponse = { success: true, days };
  return NextResponse.json(body, { status: 200 });
}
