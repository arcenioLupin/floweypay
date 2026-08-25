# 09 — Wallet Rotation

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [08 — Wallet Recovery](./08-wallet-recovery.md).

Implementa [ARCH-002](./14-architecture-decisions.md) (Wallet Rotation, Descriptor monitoring).

---

## 9.1 Wallet vieja → wallet nueva

Un comercio puede rotar a una wallet nueva (nuevo Descriptor). En el modelo de persistencia aprobado ([DB-001](./DB-001-merchant-wallet-wallet-versions.md)), la rotación crea una **nueva `MerchantWalletVersion`** (`version = N+1`, `ACTIVE`) y transiciona la anterior a `RETIRED` de forma atómica; la identidad de derivación de las versiones previas es inmutable. Los invoices nuevos usan la wallet nueva; los invoices existentes conservan sus direcciones ya derivadas. **Observación:** cualquier reinicio conceptual del cursor de asignación de la nueva versión **no** constituye la autoridad de asignación/recuperación; esa autoridad es el Allocation Ledger (DB-002) + Durable HWM (INFRA-001) por wallet version ([ARCH-005](./ARCH-005-index-reconciliation-recovery.md)).

## 9.2 Monitoring

El **Descriptor viejo continúa siendo monitoreado** (ARCH-002). Bitcoin Core sigue observando los rangos previamente fondeados para no perder nada tras el cambio (*cutover*).

## 9.3 Pagos entrantes tardíos (Late incoming payments)

Si un cliente paga tarde un invoice viejo/expirado, el pago a la dirección vieja igualmente se detecta y concilia. El historial de rotación del Recovery Package permite reconstruir el conjunto de monitoring completo. Bajo [ARCH-006 D12](./ARCH-006-late-payments-reconciliation.md#d12--wallet-version-attribution), ese Late Payment se atribuye al **invoice original**, a su **dirección derivada** y a la **wallet version** desde la que se derivó (aunque esté **RETIRED**); la rotación **no** cambia la clasificación de timing ni de amount.

## 9.4 Migración

La rotación es un cutover atómico de la asignación de nuevos invoices más un append al `wallet_rotation_history`. El monitoring de direcciones que alguna vez recibieron fondos no se detiene por defecto.

## 9.5 Dominio de reconciliación por wallet version (ARCH-005 — diseño aprobado)

El dominio de reconciliación es la **wallet version**, no el comercio globalmente ([ARCH-005 D5](./ARCH-005-index-reconciliation-recovery.md#d5--reconciliation-per-wallet-version)). Cada wallet version mantiene de forma **independiente** su Output Descriptor, cursor de derivación, Allocation Ledger, Durable HWM, rango monitoreado y estado de recuperación. Solo la wallet version **ACTIVE** asigna direcciones nuevas; las versiones **retiradas** permanecen monitoreadas por pagos tardíos. Esto hace que un `RECOVERY_FAILED` se aísle a la wallet version afectada sin bloquear a las demás.

> **Estado:** diseño aprobado; implementación pendiente.

> **Observación (política aprobada).** El tratamiento de un *pago tardío a un invoice EXPIRED* (detección, clasificación de timing/amount y conciliación del comercio) se define en [ARCH-006](./ARCH-006-late-payments-reconciliation.md) — **diseño aprobado (D1–D12); implementación pendiente** —, no en ARCH-004 ni ARCH-005. La **payment reconciliation** de ARCH-006 no debe conflarse con la **index reconciliation** de ARCH-005 (§ 9.5).

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Wallet Rotation](./13-sequence-diagrams.md#136-wallet-rotation).

---

**Siguiente:** [10 — Modelo de negocio](./10-business-model.md)
