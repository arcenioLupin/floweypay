# 07 — Dashboard del comercio

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [06 — Procesamiento Bitcoin](./06-bitcoin-processing.md).

---

## 7.1 Lista de pagos y estados

El comercio ve los invoices con estado en vivo (Awaiting / Mempool / Confirming / Confirmed / Expired), montos en fiat y BTC, recibido vs esperado, y marcas de tiempo.

## 7.2 Enlaces a explorer

Cada pago confirmado/visto expone su txid y dirección para verificación en un block explorer público, reforzando que el comercio puede auditar sus fondos de forma independiente, sin confiar en FloweyPay.

## 7.3 Notificaciones

FloweyPay agenda notificaciones en las transiciones clave — `SEEN_IN_MEMPOOL`, `CONFIRMED`, `EXPIRED` — mediante el pipeline de notificaciones del Worker.

> **ARCH-006 (diseño aprobado).** El target añade eventos de Late Payment idempotentes — `LATE_PAYMENT_DETECTED` (primer pago tardío de un invoice) y `LATE_PAYMENT_CONFIRMED` — intencionalmente mínimos, sin spam por cada transacción contribuyente ([ARCH-006 D10](./ARCH-006-late-payments-reconciliation.md#d10--late-payment-notifications)). Hoy estos eventos **no** existen; su implementación es trabajo de ARCH-006.

## 7.5 Cola de atención de Late Payments (ARCH-006 — diseño aprobado)

Se aprueba conceptualmente una **cola/superficie de atención** dedicada para pagos que llegan tras `EXPIRED`. Debe exponer lo suficiente para que el comercio decida **sin** convertir a FloweyPay en software contable: invoice, `expected_amount`, `expires_at`, `first_seen_at`, recibido, remanente/excedente, **transacciones contribuyentes**, estado de confirmación, **timing**, **amount**, **wallet version**, estado y decisión de conciliación (con actor/timestamp) y notas. Acciones auditables del comercio: `ACCEPT / DISMISS / ADD NOTE / RECORD EXTERNAL REFUND`; `EXACT` no implica `ACCEPTED` y FloweyPay **no** ejecuta reembolsos on-chain. La conciliación **agrega** historial y nunca reescribe hechos del invoice. Ver [ARCH-006](./ARCH-006-late-payments-reconciliation.md).

> **Observación (implementación actual).** Hoy no existe cola ni estado de conciliación de Late Payment; es trabajo de implementación de ARCH-006.

## 7.4 Historial de pagos

Los invoices históricos en estado terminal permanecen consultables para conciliación, contabilidad y auditoría. Los KPI del Dashboard resumen ingresos confirmados, pagos confirmados, BTC recibido e invoices activos.

Ciclo de vida de notificaciones: ver [12 — Flujo operativo § 12.3](./12-operational-flow.md#123-ciclo-de-vida-de-notificaciones).

---

**Siguiente:** [08 — Wallet Recovery](./08-wallet-recovery.md)
