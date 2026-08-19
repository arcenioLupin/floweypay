# 07 — Dashboard del comercio

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [06 — Procesamiento Bitcoin](./06-bitcoin-processing.md).

---

## 7.1 Lista de pagos y estados

El comercio ve los invoices con estado en vivo (Awaiting / Mempool / Confirming / Confirmed / Expired), montos en fiat y BTC, recibido vs esperado, y marcas de tiempo.

## 7.2 Enlaces a explorer

Cada pago confirmado/visto expone su txid y dirección para verificación en un block explorer público, reforzando que el comercio puede auditar sus fondos de forma independiente, sin confiar en FloweyPay.

## 7.3 Notificaciones

FloweyPay agenda notificaciones en las transiciones clave — `SEEN_IN_MEMPOOL`, `CONFIRMED`, `EXPIRED` — mediante el pipeline de notificaciones del Worker.

## 7.4 Historial de pagos

Los invoices históricos en estado terminal permanecen consultables para conciliación, contabilidad y auditoría. Los KPI del Dashboard resumen ingresos confirmados, pagos confirmados, BTC recibido e invoices activos.

Ciclo de vida de notificaciones: ver [12 — Flujo operativo § 12.3](./12-operational-flow.md#123-ciclo-de-vida-de-notificaciones).

---

**Siguiente:** [08 — Wallet Recovery](./08-wallet-recovery.md)
