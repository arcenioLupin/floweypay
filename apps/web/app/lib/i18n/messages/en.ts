// English dictionary for the merchant dashboard.
// This object is the source of truth for the message-key type.
// Keep keys flat and dot-namespaced for simple, type-safe lookups.

export const en = {
  // ── Brand ──────────────────────────────────────────────────────────────
  "brand.tagline": "Simple payments, full control",

  // ── Navigation ─────────────────────────────────────────────────────────
  "nav.overview": "Overview",
  "nav.payments": "Payments",
  "nav.paymentLinks": "Payment Links",

  // ── Common actions ─────────────────────────────────────────────────────
  "action.newLink": "+ New Link",
  "action.logout": "Log out",
  "action.view": "View →",
  "action.viewDetails": "View details →",
  "action.loadMore": "Load more",

  // ── Aria / accessibility ───────────────────────────────────────────────
  "aria.openMenu": "Open menu",
  "aria.closeMenu": "Close menu",
  "aria.close": "Close",
  "aria.language": "Language",

  // ── Common ─────────────────────────────────────────────────────────────
  "common.loading": "Loading…",

  // ── Greeting ───────────────────────────────────────────────────────────
  "greeting.hi": "Hi, {name}",

  // ── Dashboard overview ─────────────────────────────────────────────────
  "dashboard.title": "Overview",
  "dashboard.subtitle": "BTC on-chain payment metrics",
  "dashboard.viewAllPayments": "View all payments →",

  // ── KPI cards ──────────────────────────────────────────────────────────
  "kpi.confirmedRevenue": "Confirmed Revenue",
  "kpi.confirmedRevenueSub": "fiat · cents ÷ 100",
  "kpi.confirmedPayments": "Confirmed Payments",
  "kpi.btcReceived": "BTC Received",
  "kpi.btcReceivedSub": "confirmed only",
  "kpi.activeInvoices": "Active Invoices",
  "kpi.activeInvoicesSub": "awaiting · mempool · confirming",
  "kpi.expired": "Expired",
  "kpi.conversionRate": "Conversion Rate",
  "kpi.conversionSub": "{count} of {total} started",

  // ── Daily chart ────────────────────────────────────────────────────────
  "chart.dailyTitle": "Daily Confirmed Payments",
  "chart.empty": "No confirmed payments in this period.",
  "chart.tooltipPayments": "Payments",

  // ── Date filters ───────────────────────────────────────────────────────
  "filter.from": "From",
  "filter.to": "To",
  "filter.clear": "Clear",
  "filter.status": "Status",

  // ── Payments list ──────────────────────────────────────────────────────
  "payments.title": "Payments",
  "payments.recordsShown": "{count} records shown",
  "payments.recordShown": "{count} record shown",
  "payments.moreAvailable": " · more available",
  "payments.empty": "No payments found.",

  // ── Payments table headers ─────────────────────────────────────────────
  "table.date": "Date",
  "table.product": "Product",
  "table.amount": "Amount",
  "table.btcExpected": "BTC expected",
  "table.btcReceived": "BTC received",
  "table.status": "Status",
  "table.confs": "Confs",
  "table.expires": "Expires",

  // ── Status labels ──────────────────────────────────────────────────────
  "status.PENDING": "PENDING",
  "status.AWAITING_PAYMENT": "AWAITING PAYMENT",
  "status.SEEN_IN_MEMPOOL": "SEEN IN MEMPOOL",
  "status.CONFIRMING": "CONFIRMING",
  "status.CONFIRMED": "CONFIRMED",
  "status.EXPIRED": "EXPIRED",
  "status.FAILED": "FAILED",

  // ── Payment detail ─────────────────────────────────────────────────────
  "detail.details": "Details",
  "detail.payment": "Payment",
  "detail.status": "Status",
  "detail.fiatAmount": "Fiat amount",
  "detail.message": "Message",
  "detail.product": "Product",
  "detail.btcExpected": "BTC expected",
  "detail.btcReceived": "BTC received",
  "detail.btcRemaining": "BTC remaining",
  "detail.btcOverpaid": "BTC overpaid",
  "detail.confirmations": "Confirmations",
  "detail.btcAddress": "BTC address",
  "detail.network": "Network",
  "detail.txid": "Txid",
  "detail.detectedAt": "Detected at",
  "detail.expiresAt": "Expires at",
  "detail.rateLockedAt": "Rate locked at",
  "detail.fxRate": "FX rate",
  "detail.fxRateFull": "FX rate (BTC/fiat)",
  "detail.rateProvider": "Rate provider",
  "detail.invoice": "Invoice",
  "detail.openInvoice": "Open invoice →",
  "detail.paymentLinkToken": "Payment link token",
  "detail.payerInvoice": "Payer invoice",
  "detail.backToPayments": "← Back to payments",

  // ── New payment link ───────────────────────────────────────────────────
  "pl.backDashboard": "← Dashboard",
  "pl.readyTitle": "Payment link ready",
  "pl.readySubtitle": "Share this link with your payer. No login required on their end.",
  "pl.publicLinkLabel": "Public payment link",
  "pl.copy": "Copy",
  "pl.copied": "Copied ✓",
  "pl.openPaymentPage": "Open payment page ↗",
  "pl.createAnother": "Create another link",
  "pl.newTitle": "New payment link",
  "pl.newSubtitle": "Creates a product and generates a shareable BTC payment link.",
  "pl.productTitle": "Product title",
  "pl.productTitlePlaceholder": "e.g. Consulting session",
  "pl.description": "Description",
  "pl.optional": "(optional)",
  "pl.descriptionPlaceholder": "Additional details shown to the payer",
  "pl.amount": "Amount",
  "pl.currency": "Currency",
  "pl.create": "Create payment link",
  "pl.creating": "Creating…",
  "pl.errInvalidAmount": "Please enter a valid positive amount.",
  "pl.errAmountTooSmall": "Amount is too small.",
  "pl.errCreateProduct": "Could not create product.",
  "pl.errCreateLink": "Could not create payment link.",
  "pl.errUnexpected": "Unexpected error. Please try again.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
