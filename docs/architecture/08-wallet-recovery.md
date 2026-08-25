# 08 — Wallet Recovery

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [07 — Dashboard del comercio](./07-merchant-dashboard.md).

Implementa [ARCH-002](./14-architecture-decisions.md) (Gap recovery, backup reconciliation) y [ARCH-003](./14-architecture-decisions.md) (Recovery Package).

La recuperación es central para la promesa non-custodial: el comercio siempre debe poder ver y gastar sus fondos, **con o sin** FloweyPay.

---

## 8.1 Recovery Package (ARCH-003)

Un paquete descargable, **firmado** y Watch-only que contiene:

- Descriptor + checksum
- Master Fingerprint
- Derivation Path
- Network
- Último índice asignado (last allocated index)
- Último índice fondeado (last funded index)
- Rango de importación recomendado (recommended import range)
- Historial de Wallet Rotation
- Firma (Signature)

El paquete contiene **solo datos públicos**. Se firma para garantizar autenticidad y debe viajar por un canal cifrado, porque el Descriptor revela todo el historial de direcciones y facturación del comercio.

## 8.2 Escenarios de recuperación (ARCH-003)

| Escenario | Comportamiento de recuperación |
|---|---|
| **A. Reinstalar la misma wallet desde la Seed** | La Seed reproduce el Descriptor; si el Gap ≤ límite de la wallet, los fondos aparecen; si no, importar el Descriptor del paquete con el rango recomendado. |
| **B. Nuevo teléfono/computadora** | Igual que A — la recuperación es basada en Seed, independiente del dispositivo. |
| **C. Gap grande de invoices impagos oculta los fondos** | Importar el Descriptor del paquete con **rango explícito** en Sparrow/Core, o subir el Gap Limit a ≥ `last_funded_index + 20`. |
| **D. Recuperar sin FloweyPay disponible** | El paquete es autocontenido; el comercio lo importa en cualquier wallet compatible con descriptors y gasta con su Seed. |
| **E. FloweyPay pierde/revierte la DB** | Reconciliar el `safe_next_index` **por wallet version** apoyándose en el **Durable HWM** (no solo en el estado on-chain); nunca reasignar un índice ya asignado, aunque nunca haya sido fondeado; si no puede probarse, **fail-closed** (ver [ARCH-005](./ARCH-005-index-reconciliation-recovery.md) y [12 § 12.4](./12-operational-flow.md#124-ciclo-de-vida-de-recuperación-backup-reconciliation--arch-005)). |
| **F. Rotación con invoices viejos aún vivos** | El Descriptor viejo permanece monitoreado; los pagos tardíos igual se detectan (ver [09](./09-wallet-rotation.md)). |
| **G. XPUB de cuenta/script equivocado** | Prevenido en el onboarding por la verificación de Address #0. |
| **H. Pierde el Descriptor, conserva la Seed** | Regenera el Descriptor desde la Seed, o reexporta el paquete desde FloweyPay. |
| **I. Pierde la Seed, FloweyPay tiene el Descriptor** | **Fondos no gastables** — Watch-only no puede gastar. Se comunica a los comercios por adelantado. |
| **J. HW+Sparrow, luego deja de usar Sparrow** | El Descriptor es independiente del coordinador; se importa en cualquier wallet y se firma con el dispositivo. |

## 8.3 Gap recovery

Como muchos invoices impagos avanzan el índice de derivación más allá del Gap Limit por defecto (20), una restauración ingenua desde la Seed puede no mostrar los fondos recibidos. El **rango de importación recomendado** del paquete (`[0, last_allocated_index + gap_limit + margin]`) restaura la visibilidad.

## 8.4 Independencia de FloweyPay

En ningún momento FloweyPay es requerido para recuperar fondos. La Seed (solo del comercio) más el Descriptor (reproducible desde la Seed o reexportable) son suficientes. FloweyPay es una capa de conveniencia, no una dependencia.

## 8.5 Reconciliación de índices tras restauración (ARCH-005 — diseño aprobado)

Cuando FloweyPay pierde o revierte su propio estado, debe probar el siguiente índice seguro **antes** de volver a asignar direcciones. El modelo preliminar `next_index = max(DB, registros de pago, índice fondeado on-chain) + 1` **no es suficiente por sí solo**: la cadena **no puede probar** que un índice **no fondeado** fue asignado históricamente. La protección contra esa reutilización proviene del **Durable High-Water Mark (HWM)** monotónico por wallet version, complementado por el **Allocation Ledger**. Si el `safe_next_index` no puede probarse, la asignación se **bloquea** (fail-closed).

El **Recovery Package** ([8.1](#81-recovery-package-arch-003)) es aquí evidencia **condicional/auxiliar**: puede ayudar a **avanzar** un cursor, pero **nunca** mueve el HWM ni el `safe_next_index` hacia atrás. Detalle completo, estados de recuperación y diagramas en [ARCH-005](./ARCH-005-index-reconciliation-recovery.md).

> **Estado:** diseño **aprobado**; implementación **pendiente**. Hoy el repositorio no implementa aún HWM, Allocation Ledger ni motor de reconciliación. El modelo de persistencia de la **wallet version** que estos mecanismos referencian (`MerchantWallet` → `MerchantWalletVersion`) se diseña en [DB-001](./DB-001-merchant-wallet-wallet-versions.md) (diseño aprobado; implementación pendiente).

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Wallet Recovery](./13-sequence-diagrams.md#135-wallet-recovery).

---

**Siguiente:** [09 — Wallet Rotation](./09-wallet-rotation.md)
