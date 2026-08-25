# Changelog de arquitectura

Todas las modificaciones relevantes de la arquitectura de FloweyPay se documentan en este archivo. El formato sigue una versión semántica de arquitectura.

---

## Versión 1.0 — Arquitectura MVP (Completado)

Estado: **Aprobado**.

Decisiones completadas:

- **ARCH-001** — Non-Custodial Architecture. Output Descriptor como fuente de verdad; onboarding Descriptor / XPUB / ZPUB; BIP84 / Native SegWit / P2WPKH; verificación de Address #0; validación de descriptors con Bitcoin Core.
- **ARCH-002** — Address Derivation Strategy. Una dirección por invoice; índices forward-only nunca reutilizados; reserva atómica; External receive chain; Descriptor monitoring; Gap recovery; Wallet Rotation; persistencia de metadata; estrategia de backup reconciliation.
- **ARCH-003** — Supported Wallets & Recovery Strategy. Matriz de wallets soportadas; Recovery Package firmado Watch-only; el comercio siempre posee Seed y Private Keys.
- **ARCH-004** — Functional Architecture Specification. Especificación funcional completa Merchant → Customer → Bitcoin → Confirmation, distribuida en esta documentación.

Documentación asociada: documentos [01](./01-executive-summary.md) a [16](./16-glossary.md), [ADR.md](./ADR.md), [DECISIONS.md](./DECISIONS.md).

---

## Versión 1.2 — ARCH-005: Index Reconciliation & Backup Recovery (Diseño aprobado)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición arquitectónica (solo diseño; **no** representa implementación completada):

- **ARCH-005** — Index Reconciliation & Backup Recovery. Aprobadas las decisiones **D1–D10**: Durable Allocation Record; Allocation Ledger + **Durable High-Water Mark (HWM)** con ciclo de persistencia independiente; Safety Range Burning configurable; política **fail-closed**; reconciliación **por wallet version**; **Recovery State Machine** (`READY / RECOVERY_REQUIRED / RECONCILING / RECOVERY_FAILED`) idempotente; invariante de lookahead de descriptor monitoring; Recovery Package como evidencia condicional; clasificación de backup; orden de implementación. Se documenta que la fórmula preliminar `max(DB, registros de pago, índice fondeado on-chain) + 1` **no es suficiente por sí sola**.
- La **implementación** (esquema, HWM, Allocation Ledger, Recovery State Machine, motor de reconciliación) **permanece pendiente** y precede obligatoriamente a la habilitación de la asignación non-custodial en producción (D10).

Documentación asociada: [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md), [ADR.md § ARCH-005](./ADR.md#arch-005--index-reconciliation--backup-recovery), [12-operational-flow.md](./12-operational-flow.md), [13-sequence-diagrams.md](./13-sequence-diagrams.md), [15-future-roadmap.md](./15-future-roadmap.md).

---

## Versión 1.3 — ARCH-006: Late Payments & Reconciliation (Diseño aprobado)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición arquitectónica (solo diseño; **no** representa implementación completada):

- **ARCH-006** — Late Payments & Reconciliation. Aprobadas las decisiones **D1–D12**. Principio central: FloweyPay **registra objetivamente lo que ocurrió en Bitcoin**, **preserva lo que ocurrió con el invoice** y **deja la interpretación comercial al comercio**; al ser non-custodial no puede rechazar, revertir, reembolsar ni mover un pago on-chain.
  - **Separación de ciclos de vida**: Invoice lifecycle, Bitcoin payment/on-chain lifecycle, clasificación de timing/amount y conciliación del comercio son dimensiones ortogonales; un Late Payment **no** se modela como `EXPIRED → PAID` (el invoice permanece `EXPIRED`).
  - **Clasificación**: timing (`ON_TIME | LATE | INDETERMINATE`) por first-seen confiable vs `expires_at`; amount (`UNDERPAID | EXACT | OVERPAID`) independiente; `expected_amount` inmutable; N transacciones por invoice.
  - **Conciliación del comercio**: `EXACT` no implica `ACCEPTED`; acciones auditables (ACCEPT / DISMISS / ADD NOTE / RECORD EXTERNAL REFUND); sin reembolsos on-chain.
  - **Comportamiento del link expirado**: deja de ser pagable (sin QR/acción de pago); dirección read-only.
  - **Relación con wallet-version monitoring**: detección de Late Payments a versiones RETIRED depende del monitoring por wallet version de ARCH-005; no confundir index reconciliation con payment reconciliation.
- La **implementación** (detección de late payments, columnas/estados, cola de conciliación, eventos de notificación, ocultar QR expirado) **permanece pendiente**.

Documentación asociada: [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md), [ADR.md § ARCH-006](./ADR.md#arch-006--late-payment-policy), [05-customer-payment-flow.md](./05-customer-payment-flow.md), [06-bitcoin-processing.md](./06-bitcoin-processing.md), [07-merchant-dashboard.md](./07-merchant-dashboard.md), [09-wallet-rotation.md](./09-wallet-rotation.md), [15-future-roadmap.md](./15-future-roadmap.md).

---

## Versión 1.1 — Mejoras planificadas (Placeholder)

Estado: **Planificado**.

Posibles adiciones futuras (no aprobadas; solo documentadas como roadmap):

- **Taproot** (P2TR / BIP86) como script type adicional.
- **Lightning** para pagos off-chain instantáneos.
- **Comercios multi-wallet** (múltiples descriptors activos por comercio).
- **Mejoras de monitoring** (retención de monitoring). La reconciliación de índices se aprobó como diseño en la versión 1.2 (ARCH-005).

Referencias: [ARCH-005](./ADR.md#arch-005--index-reconciliation--backup-recovery), [ARCH-006](./ADR.md#arch-006--late-payment-policy), [15-future-roadmap.md](./15-future-roadmap.md).

---

## Versión 2.0 — Evolución mayor (Reservado)

Estado: **Reservado**.

Reservado para una evolución mayor de la arquitectura. El alcance se definirá cuando las iniciativas de la versión 1.1 estén validadas y priorizadas. No debe introducirse ninguna decisión aquí sin un ADR aprobado.

---

> **Nota de mantenimiento.** Cada nueva decisión de arquitectura debe: (1) registrarse en [ADR.md](./ADR.md), (2) resumirse en [DECISIONS.md](./DECISIONS.md) y (3) añadirse a este changelog en la versión correspondiente.
