import type { SendEmailOpts } from "./mailer";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Return type of every template builder. */
export type EmailTemplate = SendEmailOpts;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatFiat(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatBtc(sats: bigint): string {
  const btc = (Number(sats) / 1e8).toFixed(8);
  return `${btc} BTC (${sats.toLocaleString("en")} sats)`;
}

function amountLine(cents: number, currency: string, btcAmountSats: bigint | null): string {
  const fiat = formatFiat(cents, currency);
  return btcAmountSats != null ? `${fiat} — ${formatBtc(btcAmountSats)}` : fiat;
}

function payerLabel(name: string | null, email: string | null): string {
  return name ?? email ?? "—";
}

const BASE_STYLE = `font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;`;

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding: 6px 20px 6px 0; color: #666; white-space: nowrap; vertical-align: top;">${label}</td>
    <td style="padding: 6px 0; font-weight: 500;">${value}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// SEEN_IN_MEMPOOL
// ---------------------------------------------------------------------------

export interface SeenInMempoolContext {
  amountCents: number;
  currency: string;
  btcAmountSats: bigint | null;
  payerName: string | null;
  payerEmail: string | null;
  productTitle: string;
}

export function buildSeenInMempoolTemplate(ctx: SeenInMempoolContext): EmailTemplate {
  const amount = amountLine(ctx.amountCents, ctx.currency, ctx.btcAmountSats);
  const payer  = payerLabel(ctx.payerName, ctx.payerEmail);

  const subject = `Payment detected — ${formatFiat(ctx.amountCents, ctx.currency)}`;

  const text = [
    `FloweyPay — Payment detected`,
    ``,
    `A payment of ${amount} has been broadcast to the Bitcoin network.`,
    `It is currently in the mempool and awaiting block confirmation.`,
    ``,
    `Product : ${ctx.productTitle}`,
    `Payer   : ${payer}`,
    `Status  : Waiting for confirmation`,
  ].join("\n");

  const html = `<div style="${BASE_STYLE} max-width: 520px;">
  <p style="font-size: 12px; color: #888; margin: 0 0 24px;">FloweyPay</p>
  <h2 style="margin: 0 0 8px; font-size: 20px;">Payment detected</h2>
  <p style="margin: 0 0 24px; color: #444;">
    A payment of <strong>${amount}</strong> has appeared in the mempool.
    Waiting for block confirmation.
  </p>
  <table style="border-collapse: collapse; width: 100%;">
    ${row("Product", ctx.productTitle)}
    ${row("Payer",   payer)}
    ${row("Status",  "Waiting for confirmation")}
  </table>
</div>`;

  return { to: "", subject, text, html };
}

// ---------------------------------------------------------------------------
// CONFIRMED
// ---------------------------------------------------------------------------

export interface ConfirmedContext {
  amountCents: number;
  currency: string;
  btcAmountSats: bigint | null;
  btcConfirmations: number;
  payerName: string | null;
  payerEmail: string | null;
  productTitle: string;
}

export function buildConfirmedTemplate(ctx: ConfirmedContext): EmailTemplate {
  const amount = amountLine(ctx.amountCents, ctx.currency, ctx.btcAmountSats);
  const payer  = payerLabel(ctx.payerName, ctx.payerEmail);

  const subject = `Payment confirmed — ${formatFiat(ctx.amountCents, ctx.currency)}`;

  const text = [
    `FloweyPay — Payment confirmed`,
    ``,
    `A payment of ${amount} has been confirmed on-chain.`,
    ``,
    `Product        : ${ctx.productTitle}`,
    `Payer          : ${payer}`,
    `Confirmations  : ${ctx.btcConfirmations}`,
  ].join("\n");

  const html = `<div style="${BASE_STYLE} max-width: 520px;">
  <p style="font-size: 12px; color: #888; margin: 0 0 24px;">FloweyPay</p>
  <h2 style="margin: 0 0 8px; font-size: 20px; color: #16a34a;">Payment confirmed ✓</h2>
  <p style="margin: 0 0 24px; color: #444;">
    A payment of <strong>${amount}</strong> has been fully confirmed on the Bitcoin blockchain.
  </p>
  <table style="border-collapse: collapse; width: 100%;">
    ${row("Product",       ctx.productTitle)}
    ${row("Payer",         payer)}
    ${row("Confirmations", String(ctx.btcConfirmations))}
  </table>
</div>`;

  return { to: "", subject, text, html };
}

// ---------------------------------------------------------------------------
// EXPIRED
// ---------------------------------------------------------------------------

export interface ExpiredContext {
  amountCents: number;
  currency: string;
  btcAmountSats: bigint | null;
  productTitle: string;
}

export function buildExpiredTemplate(ctx: ExpiredContext): EmailTemplate {
  const amount = amountLine(ctx.amountCents, ctx.currency, ctx.btcAmountSats);

  const subject = `Payment expired — ${formatFiat(ctx.amountCents, ctx.currency)}`;

  const text = [
    `FloweyPay — Payment expired`,
    ``,
    `A payment invoice for ${amount} expired before funds were received.`,
    `No funds were captured.`,
    ``,
    `Product : ${ctx.productTitle}`,
  ].join("\n");

  const html = `<div style="${BASE_STYLE} max-width: 520px;">
  <p style="font-size: 12px; color: #888; margin: 0 0 24px;">FloweyPay</p>
  <h2 style="margin: 0 0 8px; font-size: 20px; color: #dc2626;">Payment expired</h2>
  <p style="margin: 0 0 24px; color: #444;">
    A payment invoice for <strong>${amount}</strong> expired before any funds arrived.
    No funds were captured.
  </p>
  <table style="border-collapse: collapse; width: 100%;">
    ${row("Product", ctx.productTitle)}
    ${row("Status",  "No funds captured")}
  </table>
</div>`;

  return { to: "", subject, text, html };
}
