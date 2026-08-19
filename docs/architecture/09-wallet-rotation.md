# 09 — Wallet Rotation

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [08 — Wallet Recovery](./08-wallet-recovery.md).

Implementa [ARCH-002](./14-architecture-decisions.md) (Wallet Rotation, Descriptor monitoring).

---

## 9.1 Wallet vieja → wallet nueva

Un comercio puede rotar a una wallet nueva (nuevo Descriptor, `next_address_index = 0` reiniciado). Los invoices nuevos usan la wallet nueva; los invoices existentes conservan sus direcciones ya derivadas.

## 9.2 Monitoring

El **Descriptor viejo continúa siendo monitoreado** (ARCH-002). Bitcoin Core sigue observando los rangos previamente fondeados para no perder nada tras el cambio (*cutover*).

## 9.3 Pagos entrantes tardíos (Late incoming payments)

Si un cliente paga tarde un invoice viejo/expirado, el pago a la dirección vieja igualmente se detecta y concilia. El historial de rotación del Recovery Package permite reconstruir el conjunto de monitoring completo.

## 9.4 Migración

La rotación es un cutover atómico de la asignación de nuevos invoices más un append al `wallet_rotation_history`. El monitoring de direcciones que alguna vez recibieron fondos no se detiene por defecto.

## 9.5 Dominio de reconciliación por wallet version (ARCH-005 — diseño aprobado)

El dominio de reconciliación es la **wallet version**, no el comercio globalmente ([ARCH-005 D5](./ARCH-005-index-reconciliation-recovery.md#d5--reconciliation-per-wallet-version)). Cada wallet version mantiene de forma **independiente** su Output Descriptor, cursor de derivación, Allocation Ledger, Durable HWM, rango monitoreado y estado de recuperación. Solo la wallet version **ACTIVE** asigna direcciones nuevas; las versiones **retiradas** permanecen monitoreadas por pagos tardíos. Esto hace que un `RECOVERY_FAILED` se aísle a la wallet version afectada sin bloquear a las demás.

> **Estado:** diseño aprobado; implementación pendiente.

> **Observación (política diferida).** El tratamiento contable de un *pago tardío a un invoice EXPIRED* (acreditar / reembolsar / revisión manual) se define en [ARCH-006](./ADR.md#arch-006--late-payment-policy), no en ARCH-004 ni ARCH-005.

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Wallet Rotation](./13-sequence-diagrams.md#136-wallet-rotation).

---

**Siguiente:** [10 — Modelo de negocio](./10-business-model.md)
