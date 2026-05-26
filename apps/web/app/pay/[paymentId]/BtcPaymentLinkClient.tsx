/* eslint-disable react-hooks/purity */
"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import styles from "./BtcPaymentLink.module.css";
import { useI18n } from "./i18n/useI18n";
import LanguageToggle from "./LanguageToggle";

import { PaymentStatus } from "@/app/types/paymentTypes";
import {
  buildBitcoinUri,
  formatCountdown,
  formatExpiresLabel,
  formatFiat,
  formatSats,
  networkKey,
  satsToBtcString,
  statusStepIndex,
} from "@/app/helpers/btcPaymentLinkHelpers";

import { useNowMs } from "./hooks/useNowMs";
import { usePaymentLinkVm } from "./hooks/usePaymentLinkVm";
import { useRegenerateInvoice } from "./hooks/useRegenerateInvoice";

// ─── Timeline step definitions ────────────────────────────────────────────────
const TIMELINE_STEPS: Array<{ n: number; key: string }> = [
  { n: 1, key: "timeline_awaiting" },
  { n: 2, key: "timeline_mempool" },
  { n: 3, key: "timeline_confirming" },
  { n: 4, key: "timeline_confirmed" },
];

const BtcPaymentLinkClient = ({ paymentId }: { paymentId: string }) => {
  const { lang, setLanguage, t } = useI18n("es");
  const locale = lang === "es" ? "es-PE" : "en-US";

  const { vm, loading, error, reload } = usePaymentLinkVm(paymentId);
  const nowMs = useNowMs(250);
  const { regenerate, loading: regenLoading, error: regenError } = useRegenerateInvoice(vm?.paymentLinkToken);

  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const onCopy = async () => {
    if (!vm?.btcAddress) return;
    try {
      await navigator.clipboard.writeText(vm.btcAddress);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page} style={{ padding: 24 }}>
        <div className={styles.logo}>FloweyPay</div>
        <p>{t("loading")}</p>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (!vm || error) {
    return (
      <div className={styles.page} style={{ padding: 24 }}>
        <div className={styles.logo}>FloweyPay</div>
        <h3>{t("errorTitle")}</h3>
        <p style={{ opacity: 0.8 }}>{error ?? "UNKNOWN_ERROR"}</p>
        <button type="button" className={styles.copyBtn} onClick={reload}>
          {t("retry")}
        </button>
      </div>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  const expiresMs = Number.isFinite(Date.parse(vm.btcExpiresAt))
    ? new Date(vm.btcExpiresAt).getTime()
    : Date.now();

  const remainingMs = nowMs == null ? null : expiresMs - nowMs;
  const countdown = remainingMs == null ? "--:--" : formatCountdown(remainingMs);

  const isTimerExpired = remainingMs != null && remainingMs <= 0;
  const isExpired = vm.status === "EXPIRED" || isTimerExpired;
  const isFailed = vm.status === "FAILED";
  const isTerminal = isExpired || isFailed;
  const isConfirmed = vm.status === "CONFIRMED";

  // Effective status for data-status theming (covers timer-expired before server reflects it)
  const effectiveStatus: PaymentStatus = isExpired
    ? "EXPIRED"
    : isFailed
    ? "FAILED"
    : vm.status;

  const isUrgent = remainingMs != null && remainingMs > 0 && remainingMs < 120_000;

  const bitcoinUri = buildBitcoinUri(vm.btcAddress, vm.btcAmountSats);
  const expiresLabel = formatExpiresLabel(vm.btcExpiresAt, locale);

  const step = statusStepIndex(vm.status);

  const statusLabel =
    vm.status === "AWAITING_PAYMENT"
      ? t("timeline_awaiting")
      : vm.status === "SEEN_IN_MEMPOOL"
      ? t("timeline_mempool")
      : vm.status === "CONFIRMING"
      ? t("timeline_confirming")
      : vm.status === "CONFIRMED"
      ? t("timeline_confirmed")
      : vm.status;

  const copyLabel =
    copyState === "ok"
      ? t("copied")
      : copyState === "fail"
      ? t("copiedFail")
      : t("copy");

  return (
    <div className={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>FloweyPay</div>
          <div className={styles.subtitle}>{t("brandSubtitle")}</div>
        </div>

        <div className={styles.headerRight}>
          <LanguageToggle lang={lang} onChange={setLanguage} />

          <div className={styles.headerPills}>
            <span className={styles.pill}>{t("rateLockPill")}</span>
            <span className={styles.pill}>{t(networkKey(vm.btcNetwork))}</span>
          </div>
        </div>
      </header>

      {/* ── Expired / Failed banner ─────────────────────────────────────────── */}
      {isTerminal && (
        <div className={styles.banner} data-status={effectiveStatus}>
          {isExpired ? (
            <div className={styles.bannerContent}>
              <div className={styles.bannerText}>
                <strong>{t("bannerExpiredTitle")}</strong> {t("bannerExpiredBody")}
              </div>
              <div className={styles.bannerCta}>
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={regenLoading || !vm.paymentLinkToken}
                  className={styles.copyBtn}
                >
                  {regenLoading ? t("regenerating") : t("regenerateInvoice")}
                </button>
                {regenError && <span className={styles.bannerError}>{regenError}</span>}
              </div>
            </div>
          ) : (
            <>
              <strong>{t("bannerFailedTitle")}</strong> {t("bannerFailedBody")}
            </>
          )}
        </div>
      )}

      {/* ── Confirmed banner ────────────────────────────────────────────────── */}
      {isConfirmed && (
        <div className={styles.banner} data-status="CONFIRMED">
          <strong>{t("bannerConfirmedTitle")}</strong> {t("bannerConfirmedBody")}
        </div>
      )}

      {/* ── Main two-column grid ────────────────────────────────────────────── */}
      <main className={styles.mainGrid}>

        {/* Left: QR + Address */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t("cardQrTitle")}</h3>

          <div className={[styles.qrBox, isExpired ? styles.qrBoxExpired : ""].filter(Boolean).join(" ")}>
            <QRCode value={bitcoinUri} size={220} />
          </div>

          <div className={styles.addressRow}>
            <div className={styles.addressText} title={vm.btcAddress}>
              {vm.btcAddress}
            </div>
            <button
              className={styles.copyBtn}
              onClick={onCopy}
              type="button"
              disabled={copyState !== "idle" || isExpired}
              data-copy={copyState}
              aria-label={t("copy")}
            >
              {copyLabel}
            </button>
          </div>

          <a
            className={styles.openWalletBtn}
            href={bitcoinUri}
            aria-disabled={isExpired}
            tabIndex={isExpired ? -1 : undefined}
          >
            {t("openWallet")}
          </a>
          <p className={styles.openWalletHint}>{t("openWalletHint")}</p>
        </section>

        {/* Right: Details */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t("cardDetailsTitle")}</h3>

          {/* Amount — fiat-first */}
          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelAmount")}</div>
            <div className={styles.amountRow}>
              <div className={styles.fiatBig}>
                {formatFiat(vm.fiatAmountCents, vm.currency, locale)}
              </div>
              <div className={styles.satsMuted}>
                {formatSats(vm.btcAmountSats)} {t("satsSuffix")}
                {" · "}
                {satsToBtcString(vm.btcAmountSats)} BTC
              </div>
            </div>

            {vm.btcReceivedSats > 0n && vm.btcRemainingSats > 0n && (
              <div className={styles.partialPayRow}>
                {t("labelReceived")}: {formatSats(vm.btcReceivedSats)} / {formatSats(vm.btcAmountSats)} {t("satsSuffix")}
                {" \u2014 "}
                {t("labelRemaining")}: {formatSats(vm.btcRemainingSats)} {t("satsSuffix")}
              </div>
            )}
            {vm.btcOverpaidSats > 0n && (
              <div className={styles.overpaidRow}>
                {t("labelOverpaid")}: +{formatSats(vm.btcOverpaidSats)} {t("satsSuffix")}
              </div>
            )}
          </div>

          {/* Locked rate */}
          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelLockedRate")}</div>
            <div className={styles.mono}>
              {vm.btcFxRateBtcPerFiat
                ? `1 ${vm.currency} = ${vm.btcFxRateBtcPerFiat} BTC`
                : "—"}
            </div>
          </div>

          {/* Expiration */}
          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelExpiration")}</div>
            <div className={styles.mono}>
              <strong className={isUrgent ? styles.countdownUrgent : undefined}>
                {isExpired ? t("labelExpired") : countdown}
              </strong>
              {!isExpired && (
                <span className={styles.dim}>
                  {" \u2022 "}{t("validUntil")} {expiresLabel}
                </span>
              )}
            </div>
          </div>

          {/* Status */}
          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelStatus")}</div>
            <div className={styles.statusRow}>
              <span className={styles.statusChip} data-status={effectiveStatus}>
                {statusLabel}
              </span>
              <span className={styles.dim}>
                {t("confirmationsShort")}: {vm.btcConfirmations}/{vm.btcRequiredConfirmations}
              </span>
            </div>
          </div>

          {/* Technical details (collapsed) */}
          <details className={styles.tech}>
            <summary>{t("detailsToggle")}</summary>
            <div className={styles.techBody}>
              <div>{t("tech_txid")}: {vm.btcTxid ?? "—"}</div>
              <div>{t("tech_detectedAt")}: {vm.btcDetectedAt ?? "—"}</div>
              <div>{t("tech_rateLockedAt")}: {vm.btcRateLockedAt ?? "—"}</div>
              <div>{t("tech_statusRaw")}: {vm.status as PaymentStatus}</div>
              <div>{t("uriHint")}: {bitcoinUri}</div>
            </div>
          </details>
        </section>
      </main>

      {/* ── Status timeline ─────────────────────────────────────────────────── */}
      <section className={styles.timeline}>
        <h3 className={styles.timelineTitle}>{t("timelineTitle")}</h3>

        <div className={styles.steps}>
          {TIMELINE_STEPS.map(({ n, key }) => {
            const isDone = step > n;
            const isActive = step === n;
            return (
              <div
                key={n}
                className={[
                  styles.step,
                  isActive ? styles.stepActive : "",
                  isDone ? styles.stepDone : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className={styles.stepNum}>{isDone ? "✓" : n}</div>
                <div className={styles.stepLabel}>{t(key)}</div>
              </div>
            );
          })}
        </div>

        <div className={styles.timelineHint}>
          {t("terminalStatesLabel")}: <strong>{t("terminalExpired")}</strong>
          {" \u2022 "}
          <strong>{t("terminalFailed")}</strong>
        </div>
      </section>
    </div>
  );
};

export default BtcPaymentLinkClient;
