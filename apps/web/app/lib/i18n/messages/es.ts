// Spanish dictionary for the merchant dashboard.
// Typed against `Messages` so any missing/extra key is a compile error.

import type { Messages } from "./en";

export const es: Messages = {
  // ── Brand ──────────────────────────────────────────────────────────────
  "brand.tagline": "Cobros simples, control total",

  // ── Navigation ─────────────────────────────────────────────────────────
  "nav.overview": "Resumen",
  "nav.payments": "Pagos",
  "nav.paymentLinks": "Links de pago",

  // ── Common actions ─────────────────────────────────────────────────────
  "action.newLink": "+ Nuevo link",
  "action.logout": "Salir",
  "action.view": "Ver →",
  "action.viewDetails": "Ver detalles →",
  "action.loadMore": "Cargar más",

  // ── Aria / accessibility ───────────────────────────────────────────────
  "aria.openMenu": "Abrir menú",
  "aria.closeMenu": "Cerrar menú",
  "aria.close": "Cerrar",
  "aria.language": "Idioma",

  // ── Common ─────────────────────────────────────────────────────────────
  "common.loading": "Cargando…",

  // ── Greeting ───────────────────────────────────────────────────────────
  "greeting.hi": "Hola, {name}",

  // ── Dashboard overview ─────────────────────────────────────────────────
  "dashboard.title": "Resumen",
  "dashboard.subtitle": "Métricas de pagos on-chain en BTC",
  "dashboard.viewAllPayments": "Ver todos los pagos →",

  // ── KPI cards ──────────────────────────────────────────────────────────
  "kpi.confirmedRevenue": "Ingresos confirmados",
  "kpi.confirmedRevenueSub": "fiat · centavos ÷ 100",
  "kpi.confirmedPayments": "Pagos confirmados",
  "kpi.btcReceived": "BTC recibido",
  "kpi.btcReceivedSub": "solo confirmados",
  "kpi.activeInvoices": "Facturas activas",
  "kpi.activeInvoicesSub": "en espera · mempool · confirmando",
  "kpi.expired": "Expirados",
  "kpi.conversionRate": "Tasa de conversión",
  "kpi.conversionSub": "{count} de {total} iniciados",

  // ── Daily chart ────────────────────────────────────────────────────────
  "chart.dailyTitle": "Pagos confirmados por día",
  "chart.empty": "No hay pagos confirmados en este período.",
  "chart.tooltipPayments": "Pagos",

  // ── Date filters ───────────────────────────────────────────────────────
  "filter.from": "Desde",
  "filter.to": "Hasta",
  "filter.clear": "Limpiar",
  "filter.status": "Estado",

  // ── Payments list ──────────────────────────────────────────────────────
  "payments.title": "Pagos",
  "payments.recordsShown": "{count} registros mostrados",
  "payments.recordShown": "{count} registro mostrado",
  "payments.moreAvailable": " · hay más disponibles",
  "payments.empty": "No se encontraron pagos.",

  // ── Payments table headers ─────────────────────────────────────────────
  "table.date": "Fecha",
  "table.product": "Producto",
  "table.amount": "Monto",
  "table.btcExpected": "BTC esperado",
  "table.btcReceived": "BTC recibido",
  "table.status": "Estado",
  "table.confs": "Confs",
  "table.expires": "Expira",

  // ── Status labels ──────────────────────────────────────────────────────
  "status.PENDING": "PENDIENTE",
  "status.AWAITING_PAYMENT": "ESPERANDO PAGO",
  "status.SEEN_IN_MEMPOOL": "VISTO EN MEMPOOL",
  "status.CONFIRMING": "CONFIRMANDO",
  "status.CONFIRMED": "CONFIRMADO",
  "status.EXPIRED": "EXPIRADO",
  "status.FAILED": "FALLIDO",

  // ── Payment detail ─────────────────────────────────────────────────────
  "detail.details": "Detalles",
  "detail.payment": "Pago",
  "detail.status": "Estado",
  "detail.fiatAmount": "Monto fiat",
  "detail.message": "Mensaje",
  "detail.product": "Producto",
  "detail.btcExpected": "BTC esperado",
  "detail.btcReceived": "BTC recibido",
  "detail.btcRemaining": "BTC restante",
  "detail.btcOverpaid": "BTC pagado de más",
  "detail.confirmations": "Confirmaciones",
  "detail.btcAddress": "Dirección BTC",
  "detail.network": "Red",
  "detail.txid": "Txid",
  "detail.detectedAt": "Detectado en",
  "detail.expiresAt": "Expira en",
  "detail.rateLockedAt": "Tasa fijada en",
  "detail.fxRate": "Tipo de cambio",
  "detail.fxRateFull": "Tipo de cambio (BTC/fiat)",
  "detail.rateProvider": "Proveedor de tasa",
  "detail.invoice": "Factura",
  "detail.openInvoice": "Abrir factura →",
  "detail.paymentLinkToken": "Token del link de pago",
  "detail.payerInvoice": "Factura del pagador",
  "detail.backToPayments": "← Volver a pagos",

  // ── New payment link ───────────────────────────────────────────────────
  "pl.backDashboard": "← Panel",
  "pl.readyTitle": "Link de pago listo",
  "pl.readySubtitle": "Comparte este link con tu pagador. No necesita iniciar sesión.",
  "pl.publicLinkLabel": "Link de pago público",
  "pl.copy": "Copiar",
  "pl.copied": "Copiado ✓",
  "pl.openPaymentPage": "Abrir página de pago ↗",
  "pl.createAnother": "Crear otro link",
  "pl.newTitle": "Nuevo link de pago",
  "pl.newSubtitle": "Crea un producto y genera un link de pago BTC para compartir.",
  "pl.productTitle": "Título del producto",
  "pl.productTitlePlaceholder": "ej. Sesión de consultoría",
  "pl.description": "Descripción",
  "pl.optional": "(opcional)",
  "pl.descriptionPlaceholder": "Detalles adicionales mostrados al pagador",
  "pl.amount": "Monto",
  "pl.currency": "Moneda",
  "pl.create": "Crear link de pago",
  "pl.creating": "Creando…",
  "pl.errInvalidAmount": "Ingresa un monto positivo válido.",
  "pl.errAmountTooSmall": "El monto es demasiado pequeño.",
  "pl.errCreateProduct": "No se pudo crear el producto.",
  "pl.errCreateLink": "No se pudo crear el link de pago.",
  "pl.errUnexpected": "Error inesperado. Inténtalo de nuevo.",
};
