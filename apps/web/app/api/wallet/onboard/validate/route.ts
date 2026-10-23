import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";
import {
  normalizeOnboardingInput,
  DescriptorError,
  type BtcNet,
} from "@/app/api/_lib/descriptor";
import {
  getNodeNetwork,
  getDescriptorInfo,
  deriveAddress0,
  WalletRpcError,
} from "@/app/api/_lib/walletRpc";
import {
  CHALLENGE_TTL_MS,
  MAX_BODY_BYTES,
  MAX_WALLET_MATERIAL_LEN,
  ONBOARDING_ERROR_CODES,
  generateChallengeToken,
  hashChallengeToken,
  redactFingerprint,
  walletErrorStatus,
} from "@/app/api/_lib/walletOnboarding";
import { enforceSameOrigin } from "@/lib/security/origin";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rateLimit";

/**
 * API-001 — POST /api/wallet/onboard/validate
 *
 * Step 1 of merchant public-wallet onboarding. Accepts an extended public key
 * or full output descriptor (never private material), validates and
 * canonicalizes it against Bitcoin Core, derives Address #0, and issues a
 * single-use confirmation challenge. Nothing is persisted to the wallet tables
 * here — persistence happens only after the merchant confirms Address #0.
 */

const NETWORKS = ["MAINNET", "TESTNET", "SIGNET", "REGTEST"] as const;

const BodySchema = z.object({
  walletMaterial: z.string().min(1).max(MAX_WALLET_MATERIAL_LEN),
  network: z.enum(NETWORKS),
  masterFingerprint: z.string().max(16).optional(),
  account: z.number().int().min(0).max(0x7fffffff).optional(),
});

function fail(code: string): NextResponse {
  return NextResponse.json(
    { success: false, message: code },
    { status: walletErrorStatus(code) }
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  // CSRF / same-origin enforcement for a cookie-authenticated mutation.
  const originReject = enforceSameOrigin(req);
  if (originReject) return originReject;

  // IP-based abuse throttle.
  const ip = getClientIp(req);
  const rl = checkRateLimit({
    key: `wallet-onboard-validate:ip:${ip}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    // Bound the payload before auth / JSON parsing (cheap DoS guard).
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) return fail("WALLET_INPUT_INVALID");

    const userId = await requireUserId();

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return fail("WALLET_INPUT_INVALID");
    }
    const body = BodySchema.parse(json);

    // One wallet per merchant (MVP). Reject early if one already exists.
    const existing = await prisma.merchant_wallets.findUnique({
      where: { merchant_id: userId },
      select: { id: true },
    });
    if (existing) return fail(ONBOARDING_ERROR_CODES.ALREADY_EXISTS);

    // Pure parse/normalize: rejects private material, unsupported scripts,
    // network/coin mismatches, and missing key-origin metadata.
    const normalized = normalizeOnboardingInput({
      walletMaterial: body.walletMaterial,
      network: body.network as BtcNet,
      masterFingerprint: body.masterFingerprint,
      account: body.account,
    });

    // The node's own network must match the requested one (fail closed).
    const nodeNetwork = await getNodeNetwork();
    if (nodeNetwork !== normalized.network) {
      return fail("WALLET_NETWORK_MISMATCH");
    }

    // Authoritative validation + canonicalization (validates any supplied
    // checksum before canonicalization).
    const info = await getDescriptorInfo(normalized.descriptorForValidation);

    // Derive the external receive Address #0 from the canonical descriptor.
    const address0 = await deriveAddress0(info.canonicalDescriptor);

    const now = new Date();

    // Bounded lazy cleanup: remove at most 50 stale challenges.
    const staleChallenges =
      await prisma.merchant_wallet_onboarding_challenge.findMany({
        where: {
          merchant_id: userId,
          OR: [
            { consumed_at: { not: null } },
            { expires_at: { lte: now } },
          ],
        },
        select: { id: true },
        orderBy: { created_at: "asc" },
        take: 50,
      });

    if (staleChallenges.length > 0) {
      await prisma.merchant_wallet_onboarding_challenge.deleteMany({
        where: {
          merchant_id: userId,
          id: { in: staleChallenges.map((challenge) => challenge.id) },
          OR: [
            { consumed_at: { not: null } },
            { expires_at: { lte: new Date() } },
          ],
        },
      });
    }

    // Issue a single-use challenge; store only the token hash.
    const token = generateChallengeToken();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
    await prisma.merchant_wallet_onboarding_challenge.create({
      data: {
        challenge_token_hash: hashChallengeToken(token),
        merchant_id: userId,
        descriptor: info.canonicalDescriptor,
        descriptor_checksum: info.checksum,
        master_fingerprint: normalized.masterFingerprint,
        derivation_path: normalized.derivationPath,
        network: normalized.network,
        script_type: normalized.scriptType,
        address0,
        expires_at: expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        address0,
        network: normalized.network,
        scriptType: normalized.scriptType,
        derivationPath: normalized.derivationPath,
        masterFingerprint: redactFingerprint(normalized.masterFingerprint),
        confirmationToken: token,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED");
    }
    if (err instanceof DescriptorError) return fail(err.code);
    if (err instanceof WalletRpcError) return fail(err.code);
    if (err instanceof ZodError) return fail("WALLET_INPUT_INVALID");
    return NextResponse.json(
    { success: false, message: "INTERNAL_ERROR" },
    { status: 500 }
    );
  }
}
