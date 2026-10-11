import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";
import {
  INITIAL_LIFECYCLE,
  INITIAL_SCRIPT_TYPE,
  INITIAL_VERSION,
  MAX_ADDRESS_LEN,
  MAX_BODY_BYTES,
  MAX_CONFIRM_ATTEMPTS,
  ONBOARDING_ERROR_CODES,
  WALLET_CREATED_ACTOR,
  WALLET_CREATED_EVENT,
  evaluateConfirm,
  hashChallengeToken,
  walletErrorStatus,
} from "@/app/api/_lib/walletOnboarding";
import { enforceSameOrigin } from "@/lib/security/origin";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rateLimit";

/**
 * API-001 - POST /api/wallet/onboard/confirm
 *
 * Step 2 of merchant public-wallet onboarding. The merchant explicitly
 * acknowledges the derived Address #0. This is NOT cryptographic proof
 * of possession of the corresponding private keys.
 *
 * On success, the challenge is atomically consumed and the wallet
 * (v1 ACTIVE), recovery state (RECOVERY_REQUIRED), descriptor monitoring
 * (PENDING), and WALLET_CREATED audit event are persisted in one transaction.
 *
 * The wallet is NOT ready to receive payments at this stage.
 * Independent recovery and descriptor reconciliation must complete first.
 */

const BodySchema = z.object({
  confirmationToken: z.string().min(1).max(512),
  confirmedAddress0: z.string().min(1).max(MAX_ADDRESS_LEN),
});

/** Internal signal: the atomic consume lost a race / no longer valid. */
class ConsumeRaceError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function fail(code: string): NextResponse {
  return NextResponse.json(
    { success: false, message: code },
    { status: walletErrorStatus(code) }
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const originReject = enforceSameOrigin(req);
  if (originReject) return originReject;

  const ip = getClientIp(req);
  const rl = checkRateLimit({
    key: `wallet-onboard-confirm:ip:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
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

    const tokenHash = hashChallengeToken(body.confirmationToken);
    const now = new Date();

    const row = await prisma.merchant_wallet_onboarding_challenge.findUnique({
      where: { challenge_token_hash: tokenHash },
      select: {
        merchant_id: true,
        address0: true,
        expires_at: true,
        consumed_at: true,
        attempts: true,
      },
    });

    const decision = evaluateConfirm({
      row,
      merchantId: userId,
      confirmedAddress0: body.confirmedAddress0,
      now,
      maxAttempts: MAX_CONFIRM_ATTEMPTS,
    });

    switch (decision) {
      case "NOT_FOUND":
      case "CROSS_MERCHANT":
      case "CONSUMED":
      case "TOO_MANY_ATTEMPTS":
        // Deliberately indistinct to avoid a challenge-probing oracle.
        return fail(ONBOARDING_ERROR_CODES.CHALLENGE_INVALID);
      case "EXPIRED":
        return fail(ONBOARDING_ERROR_CODES.CHALLENGE_EXPIRED);

      case "MISMATCH": {
        // Increment only while the challenge remains valid and below the cap.
        // PostgreSQL evaluates these conditions atomically with the update.
        const updated =
            await prisma.merchant_wallet_onboarding_challenge.updateMany({
            where: {
                challenge_token_hash: tokenHash,
                merchant_id: userId,
                consumed_at: null,
                expires_at: { gt: new Date() },
                attempts: { lt: MAX_CONFIRM_ATTEMPTS },
            },
            data: {
                attempts: { increment: 1 },
            },
            });

        if (updated.count !== 1) {
            return fail(ONBOARDING_ERROR_CODES.CHALLENGE_INVALID);
        }

        return fail(ONBOARDING_ERROR_CODES.ADDRESS0_MISMATCH);
    }

      case "CONSUME":
        break;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Serialize concurrent confirms for this merchant.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))::text`;

        // Atomic single-use consume: only one caller can flip consumed_at.
        const consumed = await tx.$executeRaw`
          UPDATE merchant_wallet_onboarding_challenge
          SET consumed_at = clock_timestamp()
          WHERE challenge_token_hash = ${tokenHash}
            AND merchant_id = ${userId}::uuid
            AND consumed_at IS NULL
            AND expires_at > clock_timestamp()
            AND attempts < ${MAX_CONFIRM_ATTEMPTS}
        `;
        if (consumed !== 1) throw new ConsumeRaceError();

        const fresh =
          await tx.merchant_wallet_onboarding_challenge.findUnique({
            where: { challenge_token_hash: tokenHash },
            select: {
              descriptor: true,
              descriptor_checksum: true,
              master_fingerprint: true,
              derivation_path: true,
              network: true,
              script_type: true,
            },
          });
        if (!fresh) throw new ConsumeRaceError();

        const wallet = await tx.merchant_wallets.create({
          data: { merchant_id: userId },
          select: { id: true },
        });

        const version = await tx.merchant_wallet_versions.create({
          data: {
            merchant_wallet_id: wallet.id,
            version: INITIAL_VERSION,
            descriptor: fresh.descriptor,
            descriptor_checksum: fresh.descriptor_checksum,
            master_fingerprint: fresh.master_fingerprint,
            derivation_path: fresh.derivation_path,
            network: fresh.network,
            script_type: INITIAL_SCRIPT_TYPE,
            lifecycle: INITIAL_LIFECYCLE,
          },
          select: { id: true },
        });

        // Defaults establish RECOVERY_REQUIRED / INITIAL_ESTABLISHMENT.
        await tx.merchant_wallet_recovery_state.create({
          data: { wallet_version_id: version.id },
        });
        // Default establishes PENDING monitoring.
        await tx.merchant_wallet_descriptor_monitoring.create({
          data: { wallet_version_id: version.id },
        });

        await tx.wallet_audit_events.create({
          data: {
            merchant_wallet_id: wallet.id,
            event_type: WALLET_CREATED_EVENT,
            actor_type: WALLET_CREATED_ACTOR,
            actor_user_id: userId,
            to_wallet_version_id: version.id,
          },
        });

        return { walletId: wallet.id, walletVersionId: version.id };
      });

      return NextResponse.json({
        success: true,
        data: {
          walletId: result.walletId,
          walletVersionId: result.walletVersionId,
          version: INITIAL_VERSION,
        },
      });
    } catch (txErr) {
      if (isUniqueViolation(txErr)) {
        return fail(ONBOARDING_ERROR_CODES.ALREADY_EXISTS);
      }
      if (txErr instanceof ConsumeRaceError) {
        return fail(ONBOARDING_ERROR_CODES.CHALLENGE_INVALID);
      }
      throw txErr;
    }
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED");
    }
    if (err instanceof ZodError) return fail("WALLET_INPUT_INVALID");
    return NextResponse.json(
      { success: false, message: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
