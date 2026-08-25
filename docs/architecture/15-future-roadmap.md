# 15 — Roadmap futuro

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [14 — Decisiones de arquitectura](./14-architecture-decisions.md).

> Estos son elementos **planificados**, no rediseños de la arquitectura aprobada. No introducen ni modifican decisiones aprobadas. **Excepción:** el **diseño** de ARCH-005 (D1–D10) y de ARCH-006 (D1–D12) ya está **aprobado**; solo su **implementación** permanece pendiente. Se conservan aquí para trazar el trabajo de implementación restante.

---

## ARCH-005 — Reconciliación de índices y Backup Recovery

Estado: **Diseño aprobado**; **implementación pendiente**.

El **diseño** de ARCH-005 (D1–D10) está **aprobado** y ha dejado de ser un elemento planificado. Lo que permanece pendiente es la **implementación** (esquema de wallet version, Allocation Ledger, Durable HWM, protocolo de asignación seguro, descriptor monitoring con lookahead, Recovery State Machine, motor de reconciliación, procedimientos y tests de recuperación), conforme al orden de D10.

- **Reconciliación de índices** — la fórmula preliminar `next_index = max(DB, índice fondeado on-chain, registros de pago) + 1` **no es suficiente por sí sola**; el modelo aprobado se apoya en el **Durable HWM** por wallet version.
- **Backup Recovery** — runbook operativo para restaurar el estado de FloweyPay y re-derivar de forma segura (extiende el runbook de backups existente en [../ops/backup-restore-runbook.md](../ops/backup-restore-runbook.md)).

Referencia: [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md), [ADR.md § ARCH-005](./ADR.md#arch-005--index-reconciliation--backup-recovery), [12 — Flujo operativo § 12.4](./12-operational-flow.md#124-ciclo-de-vida-de-recuperación-backup-reconciliation--arch-005).

## ARCH-006 — Late Payments & Reconciliation

Estado: **Diseño aprobado**; **implementación pendiente**.

El **diseño** de ARCH-006 (D1–D12) está **aprobado** y ha dejado de ser un elemento planificado. Define cómo FloweyPay detecta, representa, concilia, comunica y opera pagos Bitcoin que llegan **después** de que un invoice pasó a `EXPIRED`, preservando la separación entre Invoice lifecycle, Bitcoin payment lifecycle, clasificación de timing/amount y conciliación del comercio. Lo que permanece pendiente es la **implementación** (detección de late payments en el Worker, columnas/estados de clasificación y conciliación, cola de atención del Dashboard, eventos de notificación de Late Payment, y el comportamiento no-pagable del Payment Link expirado).

Referencia: [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md), [ADR.md § ARCH-006](./ADR.md#arch-006--late-payment-policy), [09 — Wallet Rotation](./09-wallet-rotation.md).

## Extensiones de protocolo

Estado: **Planificado**.

- **Taproot (P2TR / BIP86)** — script type adicional más allá del MVP.
- **Multisig** — wallets multi-clave basadas en descriptors.
- **Lightning** — pagos off-chain instantáneos (modelo de custodia a definir por separado).
- **Comercios multi-wallet** — múltiples descriptors activos por comercio con enrutamiento.

Referencia: [CHANGELOG.md](./CHANGELOG.md).

---

## Notas de gobernanza

- Ningún elemento de este roadmap debe implementarse sin un ADR aprobado que lo promueva de **Planificado** a **Aprobado**.
- Al aprobarse, cada elemento debe registrarse en [ADR.md](./ADR.md), resumirse en [DECISIONS.md](./DECISIONS.md) y añadirse a [CHANGELOG.md](./CHANGELOG.md).

---

**Siguiente:** [16 — Glosario](./16-glossary.md)
