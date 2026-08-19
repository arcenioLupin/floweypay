# Índice de Architecture Decision Records (ADR)

Este documento indexa todas las decisiones de arquitectura de FloweyPay. Cada ADR representa una decisión formal, con su estado, resumen, documentación relacionada, dependencias y consideraciones futuras.

> Las decisiones **Aprobadas** no se rediseñan. Las decisiones **Planificadas** describen trabajo futuro documentado, no rediseños.

| ADR | Título | Estado |
|---|---|---|
| [ARCH-001](#arch-001--non-custodial-architecture) | Non-Custodial Architecture | Aprobado |
| [ARCH-002](#arch-002--address-derivation-strategy) | Address Derivation Strategy | Aprobado |
| [ARCH-003](#arch-003--supported-wallets--recovery-strategy) | Supported Wallets & Recovery Strategy | Aprobado |
| [ARCH-004](#arch-004--functional-architecture-specification) | Functional Architecture Specification | Aprobado |
| [ARCH-005](#arch-005--index-reconciliation--backup-recovery) | Index Reconciliation & Backup Recovery | Aprobado (diseño); implementación pendiente |
| [ARCH-006](#arch-006--late-payment-policy) | Late Payment Policy | Planificado |

---

## ARCH-001 — Non-Custodial Architecture

- **Título:** Arquitectura Non-Custodial y Output Descriptor como fuente de verdad.
- **Estado:** Aprobado.
- **Resumen:**
  - Arquitectura estrictamente **non-custodial**: FloweyPay nunca controla fondos.
  - El **Output Descriptor** validado por checksum es la fuente interna de verdad.
  - El onboarding acepta **Descriptor / XPUB / ZPUB** y se normaliza a un Descriptor **BIP84**.
  - MVP soporta únicamente **Native SegWit / P2WPKH / BIP84**.
  - **Verificación obligatoria de Address #0**.
  - **Bitcoin Core** valida los descriptors.
- **Documentación relacionada:** [01-executive-summary.md](./01-executive-summary.md), [03-merchant-onboarding.md](./03-merchant-onboarding.md), [14-architecture-decisions.md](./14-architecture-decisions.md).
- **Dependencias:** ninguna (decisión fundacional). Requiere un nodo Bitcoin Core operativo.
- **Consideraciones futuras:** ampliación de script types (Taproot) en [ARCH-006](#arch-006--late-payment-policy) y [15-future-roadmap.md](./15-future-roadmap.md).

---

## ARCH-002 — Address Derivation Strategy

- **Título:** Estrategia de derivación de direcciones.
- **Estado:** Aprobado.
- **Resumen:**
  - **Una dirección única por invoice**.
  - Índices de derivación **forward-only**, **nunca reutilizados**.
  - **Reserva atómica** del índice.
  - Solo la **External receive chain** (`0/*`).
  - Path **BIP84**: `m/84'/coin_type'/account'/0/index`.
  - Persistencia de **metadata** de la wallet (wallet ID, índice, path, network, dirección).
  - Estrategia de **Gap recovery** (Gap Limit por defecto 20).
  - **Descriptor monitoring** por rangos, adelantado a la asignación.
  - **Wallet Rotation** soportada.
  - Estrategia de **backup reconciliation**.
- **Documentación relacionada:** [04-payment-link-creation.md](./04-payment-link-creation.md), [08-wallet-recovery.md](./08-wallet-recovery.md), [09-wallet-rotation.md](./09-wallet-rotation.md), [12-operational-flow.md](./12-operational-flow.md).
- **Dependencias:** ARCH-001 (Descriptor como fuente de verdad).
- **Consideraciones futuras:** la reconciliación de índices y el Backup Recovery quedan formalizados y **aprobados** en [ARCH-005](#arch-005--index-reconciliation--backup-recovery) (D1–D10).

---

## ARCH-003 — Supported Wallets & Recovery Strategy

- **Título:** Wallets soportadas y estrategia de recuperación.
- **Estado:** Aprobado.
- **Resumen:**
  - **SUPPORTED:** Sparrow, Bitcoin Core Descriptor Wallet, Nunchuk.
  - **SUPPORTED VIA COORDINATOR:** Ledger + Sparrow, Trezor + Sparrow.
  - **SUPPORTED WITH LIMITATIONS:** Electrum, BlueWallet.
  - **NOT SUPPORTED:** Ledger Live, Trezor Suite, exchanges custodiales, legacy wallets, Wrapped SegWit, Multisig, Taproot (MVP).
  - **Recovery Package** firmado (Watch-only) con: Descriptor, Fingerprint, Derivation Path, Network, último índice asignado, último índice fondeado, rango de importación recomendado, historial de Wallet Rotation y firma.
  - El comercio siempre posee **Seed** y **Private Keys**; FloweyPay solo almacena información pública.
- **Documentación relacionada:** [08-wallet-recovery.md](./08-wallet-recovery.md), [11-security-model.md](./11-security-model.md), [14-architecture-decisions.md](./14-architecture-decisions.md).
- **Dependencias:** ARCH-001, ARCH-002.
- **Consideraciones futuras:** soporte de Multisig, Taproot y multi-wallet en [15-future-roadmap.md](./15-future-roadmap.md).

---

## ARCH-004 — Functional Architecture Specification

- **Título:** Especificación de arquitectura funcional (Merchant → Customer → Bitcoin → Confirmation).
- **Estado:** Aprobado.
- **Resumen:**
  - Documenta el flujo completo del producto desde la perspectiva de comercio, cliente, FloweyPay y la red Bitcoin.
  - Es **independiente de la implementación**: describe comportamiento de negocio, funcional e interacciones del sistema.
  - Consolida ARCH-001, ARCH-002 y ARCH-003 en una especificación funcional.
- **Documentación relacionada:** documentos [01](./01-executive-summary.md) a [16](./16-glossary.md); diagramas en [13-sequence-diagrams.md](./13-sequence-diagrams.md).
- **Dependencias:** ARCH-001, ARCH-002, ARCH-003.
- **Consideraciones futuras:** evolución hacia ARCH-005 y ARCH-006.

---

## ARCH-005 — Index Reconciliation & Backup Recovery

- **Título:** Reconciliación de índices y Backup Recovery.
- **Estado del diseño:** **Aprobado** (decisiones D1–D10). **Estado de implementación:** **Pendiente**.
- **Prioridad:** P0.
- **Resumen:**
  - La fórmula preliminar `next_index = max(DB, índice fondeado on-chain, registros de pago) + 1` **NO es suficiente por sí sola**: la cadena no puede probar que un índice **no fondeado** fue asignado históricamente.
  - **D1** Durable Allocation Record (evidencia durable, monotónica, por wallet version).
  - **D2** Allocation Ledger (DB operativa) + **Durable High-Water Mark (HWM)** con ciclo de persistencia independiente; visibilidad diferida hasta confirmar el avance del HWM.
  - **D3** Safety Range Burning configurable (defensa en profundidad; no reemplaza al HWM).
  - **D4** Fail-closed: sin `safe_next_index` probado → se bloquea la asignación.
  - **D5** Reconciliación por **wallet version**; solo ACTIVE asigna, las retiradas se monitorean.
  - **D6** Recovery State Machine: `READY / RECOVERY_REQUIRED / RECONCILING / RECOVERY_FAILED` (idempotente).
  - **D7** Lookahead: `monitored_range_end ≥ safe_next_index + configurable_lookahead`.
  - **D8** Recovery Package como evidencia condicional/auxiliar; nunca mueve HWM hacia atrás.
  - **D9** Clasificación de backup (Fund Safety / Address Allocation Safety / Service Recovery / Reconstructable).
  - **D10** Orden de implementación: garantías antes de habilitar derivación non-custodial en producción.
- **Documento dedicado:** [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md).
- **Documentación relacionada:** [12-operational-flow.md](./12-operational-flow.md), [08-wallet-recovery.md](./08-wallet-recovery.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md).
- **Dependencias:** ARCH-002 (derivación forward-only, backup reconciliation), ARCH-003 (Recovery Package).
- **Consideraciones futuras:** implementación conforme a D10; integración con el runbook operativo de backups existente ([../ops/backup-restore-runbook.md](../ops/backup-restore-runbook.md)). La política de negocio de Late Payment permanece en [ARCH-006](#arch-006--late-payment-policy).

---

## ARCH-006 — Late Payment Policy

- **Título:** Política de Late Payment (y extensiones de protocolo).
- **Estado:** **Planificado**.
- **Resumen:**
  - Define el tratamiento contable de fondos que llegan **después** de `EXPIRED` (acreditar / reembolsar / revisión manual).
  - Agrupa extensiones planificadas: Taproot (P2TR / BIP86), Multisig, Lightning y comercios multi-wallet.
- **Documentación relacionada:** [09-wallet-rotation.md](./09-wallet-rotation.md), [15-future-roadmap.md](./15-future-roadmap.md).
- **Dependencias:** ARCH-002, ARCH-003.
- **Consideraciones futuras:** requiere definición de producto antes de convertirse en decisión aprobada.
