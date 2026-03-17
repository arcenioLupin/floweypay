// apps/web/app/api/node/health/route.ts
import { NextResponse } from "next/server";
import { getBlockchainInfo, getNetworkInfo } from "../../_lib/bitcoinRpc";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [bc, net] = await Promise.all([getBlockchainInfo(), getNetworkInfo()]);

    const ok =
      bc.chain === "main" &&
      bc.initialblockdownload === false &&
      net.networkactive === true &&
      net.connections > 0;

    return NextResponse.json({
      success: true,
      ok,
      data: { blockchain: bc, network: net },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { success: false, ok: false, message },
      { status: 500 }
    );
  }
}