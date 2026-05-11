// apps/web/app/api/node/health/route.ts
import { NextResponse } from "next/server";
import { getBlockchainInfo, getNetworkInfo } from "../../_lib/bitcoinRpc";
import { getBtcNetwork } from "../../_lib/btc";
import { prisma } from "@/app/lib/prisma";
import { btc_network } from "@prisma/client";

export const runtime = "nodejs";

/** Maps our btc_network Prisma enum to the chain string returned by Bitcoin Core. */
function expectedChain(network: btc_network): string {
  switch (network) {
    case btc_network.MAINNET: return "main";
    case btc_network.TESTNET: return "test";
    case btc_network.REGTEST: return "regtest";
    case btc_network.SIGNET:  return "signet";
    default:                  return "main";
  }
}

export async function GET() {
  const [bcResult, netResult, dbResult] = await Promise.allSettled([
    getBlockchainInfo(),
    getNetworkInfo(),
    prisma.$queryRawUnsafe("SELECT 1"),
  ]);

  if (bcResult.status === "rejected" || netResult.status === "rejected") {
    const reason =
      bcResult.status === "rejected"
        ? bcResult.reason
        : (netResult as PromiseRejectedResult).reason;
    const message = reason instanceof Error ? reason.message : "RPC_ERROR";
    return NextResponse.json(
      { success: false, ok: false, message },
      { status: 500 }
    );
  }

  const bc = bcResult.value;
  const net = netResult.value;
  const dbOk = dbResult.status === "fulfilled";

  const chain = expectedChain(getBtcNetwork());
  const blockLag = bc.headers - bc.blocks;
  const synced = !bc.initialblockdownload && blockLag <= 2;

  const ok =
    bc.chain === chain &&
    synced &&
    net.networkactive === true &&
    net.connections > 0 &&
    dbOk;

  return NextResponse.json({
    success: true,
    ok,
    blockLag,
    synced,
    dbOk,
    node: {
      chain: bc.chain,
      blocks: bc.blocks,
      headers: bc.headers,
      verificationprogress: bc.verificationprogress,
      networkactive: net.networkactive,
      connections: net.connections,
    },
  });
}
