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
  statusStepIndex,
} from "@/app/helpers/btcPaymentLinkHelpers";

import { useNowMs } from "./hooks/useNowMs";
import { usePaymentLinkVm } from "./hooks/usePaymentLinkVm";
import { useRegenerateInvoice } from "./hooks/useRegenerateInvoice";

const BtcPaymentLinkClient = ({ paymentId }: { paymentId: string }) => {
  const { lang, setLanguage, t } = useI18n("es");
  const locale = lang === "es" ? "es-PE" : "en-US";

  const { vm, loading, error, reload } = usePaymentLinkVm(paymentId);
  const nowMs = useNowMs(250);
  const { regenerate, loading: regenLoading, error: regenError } = useRegenerateInvoice(vm?.paymentLinkToken);


  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");



  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 1200);
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

  // Loading / error UI simple (paso 2)
  if (loading) {
    return (
      <div className={styles.page} style={{ padding: 24 }}>
        <div className={styles.logo}>FloweyPay</div>
        <p>{t("loading") ?? "Cargando..."}</p>
      </div>
    );
  }

  if (!vm || error) {
    return (
      <div className={styles.page} style={{ padding: 24 }}>
        <div className={styles.logo}>FloweyPay</div>
        <h3>{t("errorTitle") ?? "No se pudo cargar el pago"}</h3>
        <p style={{ opacity: 0.8 }}>{error ?? "UNKNOWN_ERROR"}</p>
        <button type="button" onClick={reload}>
          {t("retry") ?? "Reintentar"}
        </button>
      </div>
    );
  }

  const expiresMs = Number.isFinite(Date.parse(vm.btcExpiresAt))
  ? new Date(vm.btcExpiresAt).getTime()
  : Date.now(); // o 0

  const remainingMs = nowMs == null ? null : expiresMs - nowMs;
  const countdown = remainingMs == null ? "--:--" : formatCountdown(remainingMs);

  const isTimerExpired = remainingMs != null && remainingMs <= 0;
  const isExpired = vm.status === "EXPIRED" || isTimerExpired;
  const isFailed = vm.status === "FAILED";

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

  return (
    <div className={styles.page}>
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

      {(isExpired || isFailed) && (
        <div className={styles.banner} data-status={vm.status}>
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
                    {regenLoading
                      ? (t("regenerating") ?? "Regenerando...")
                      : (t("regenerateInvoice") ?? "Regenerar invoice")}
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


      <main className={styles.mainGrid}>
        {/* Left: QR + Address */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t("cardQrTitle")}</h3>

          <div className={styles.qrBox}>
            <QRCode value={bitcoinUri} size={240} />
          </div>

          <div className={styles.addressRow}>
            <div className={styles.addressText} title={vm.btcAddress}>
              {vm.btcAddress}
            </div>

            <button
              className={styles.copyBtn}
              onClick={onCopy}
              type="button"
              disabled={copyState !== "idle"}
              data-copy={copyState}
            >
              {copyState === "ok" ? t("copied") : t("copy")}
            </button>
          </div>

          <a className={styles.openWalletBtn} href={bitcoinUri}>
            {t("openWallet")}
          </a>

          <div className={styles.uriHint}>
            <small>
              {t("uriHint")}: {bitcoinUri}
            </small>
          </div>
        </section>

        {/* Right: Details */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t("cardDetailsTitle")}</h3>

          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelAmount")}</div>

            <div className={styles.amountRow}>
              <div className={styles.satsBig}>
                {formatSats(vm.btcAmountSats)} {t("satsSuffix")}
              </div>

              <div className={styles.fiatSmall}>
                {formatFiat(vm.fiatAmountCents, vm.currency, locale)}
              </div>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelLockedRate")}</div>
            <div className={styles.mono}>
              {vm.btcFxRateBtcPerFiat ? `1 ${vm.currency} = ${vm.btcFxRateBtcPerFiat} BTC` : "—"}
              {vm.btcRateProvider ? `  •  provider: ${vm.btcRateProvider}` : ""}
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelExpiration")}</div>
            <div className={styles.mono}>
              <strong>{countdown}</strong>
              <span className={styles.dim}>
                {" "}
                • {t("validUntil")} {expiresLabel}
              </span>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockLabel}>{t("labelStatus")}</div>
            <div className={styles.statusRow}>
              <span className={styles.statusChip} data-status={vm.status}>
                {statusLabel}
              </span>
              <span className={styles.dim}>
                {t("confirmationsShort")}: {vm.btcConfirmations}/{vm.btcRequiredConfirmations}
              </span>
            </div>
          </div>

          <details className={styles.tech}>
            <summary>{t("detailsToggle")}</summary>
            <div className={styles.techBody}>
              <div>
                {t("tech_txid")}: {vm.btcTxid ?? "—"}
              </div>
              <div>
                {t("tech_detectedAt")}: {vm.btcDetectedAt ?? "—"}
              </div>
              <div>
                {t("tech_rateLockedAt")}: {vm.btcRateLockedAt ?? "—"}
              </div>
              <div>
                {t("tech_statusRaw")}: {vm.status as PaymentStatus}
              </div>
            </div>
          </details>
        </section>
      </main>

      {/* Timeline */}
      <section className={styles.timeline}>
        <h3 className={styles.timelineTitle}>{t("timelineTitle")}</h3>

        <div className={styles.steps}>
          <div className={`${styles.step} ${step === 1 ? styles.stepActive : ""}`}>
            <div className={styles.stepTitle}>{t("step")} 1</div>
            <div>{t("timeline_awaiting")}</div>
          </div>

          <div className={`${styles.step} ${step === 2 ? styles.stepActive : ""}`}>
            <div className={styles.stepTitle}>{t("step")} 2</div>
            <div>{t("timeline_mempool")}</div>
          </div>

          <div className={`${styles.step} ${step === 3 ? styles.stepActive : ""}`}>
            <div className={styles.stepTitle}>{t("step")} 3</div>
            <div>{t("timeline_confirming")}</div>
          </div>

          <div className={`${styles.step} ${step === 4 ? styles.stepActive : ""}`}>
            <div className={styles.stepTitle}>{t("step")} 4</div>
            <div>{t("timeline_confirmed")}</div>
          </div>
        </div>

        <div className={styles.timelineHint}>
          {t("terminalStatesLabel")}: <strong>{t("terminalExpired")}</strong> •{" "}
          <strong>{t("terminalFailed")}</strong>
        </div>
      </section>
    </div>
  );
}
export default BtcPaymentLinkClient;