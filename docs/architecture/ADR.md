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
| [ARCH-006](#arch-006--late-payment-policy) | Late Payment Policy | Aprobado (diseño); implementación pendiente |

### Tareas de persistencia de base de datos

Estas tareas **construyen sobre** las decisiones ARCH aprobadas y las materializan en el modelo de datos. **No** rediseñan ninguna decisión ARCH.

| Tarea | Título | Estado |
|---|---|---|
| [DB-001](#db-001--merchant-wallet--wallet-versions) | Merchant Wallet + Wallet Versions | Aprobado (diseño); implementación pendiente |
| [DB-002](#db-002--allocation-ledger) | Allocation Ledger (`invoice ↔ wallet_version ↔ derivation_index`) | Aprobado (diseño); implementación pendiente |
| [DB-003](#db-003--recovery-state--descriptor-monitoring) | Recovery State + Descriptor Monitoring metadata | Aprobado (diseño); implementación pendiente |
| [DB-004](#db-004--late-payment--merchant-reconciliation) | Late Payment + Merchant Reconciliation (timing/amount + conciliación + evidencia de observación) | Aprobado (diseño); implementación pendiente |

### Tareas de infraestructura / seguridad

Estas tareas materializan mecanismos de infraestructura que las decisiones ARCH/DB presuponen. **No** rediseñan ninguna decisión ARCH ni DB.

| Tarea | Título | Estado |
|---|---|---|
| [INFRA-001](#infra-001--durable-hwm) | Durable HWM (High-Water Mark) | Aprobado (diseño); implementación pendiente |

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
- **Consideraciones futuras:** ampliación de script types (Taproot) como extensión de protocolo planificada en [15-future-roadmap.md](./15-future-roadmap.md).

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

- **Título:** Política funcional de Late Payments y conciliación.
- **Estado:** **Aprobado (diseño); implementación pendiente**.
- **Resumen:** FloweyPay **registra objetivamente lo que ocurrió en Bitcoin**, **preserva lo que ocurrió con el invoice** y **deja la interpretación comercial al comercio**. Al ser non-custodial, no puede rechazar, revertir, reembolsar ni mover un pago on-chain, ni decidir por sí mismo que un Late Payment satisface el invoice. Decisiones aprobadas **D1–D12**:
  - **D1** Separar Invoice lifecycle y Bitcoin Payment lifecycle; nunca modelar un Late Payment como `EXPIRED → PAID`.
  - **D2** `ON_TIME` vs `LATE` se decide por el **first-seen** más temprano confiable vs `expires_at`; nunca por block timestamp, confirmación ni tiempo de recovery.
  - **D3** Si el first-seen no es confiable (offline/recovery/rescan), timing = `INDETERMINATE` → revisión; recovery observation-neutral.
  - **D4** Late Payment exacto: el invoice permanece `EXPIRED`; se registra `timing = LATE`, `amount = EXACT`, `reconciliation = REVIEW_REQUIRED`.
  - **D5** Sin aceptación comercial automática; `EXACT` no implica `ACCEPTED`; requiere conciliación del comercio.
  - **D6** N transacciones por invoice; acumular recibido; preservar el conjunto de txs.
  - **D7** Horizonte de detección = tiempo de monitoring de la wallet version (ARCH-005); ACTIVE y RETIRED monitoreadas; sin decommission por tiempo en MVP.
  - **D8** El Payment Link expirado deja de ser pagable (sin QR/acción de pago); dirección read-only.
  - **D9** Sin reembolsos on-chain; a lo sumo registro (record-only) de un reembolso externo.
  - **D10** Notificaciones idempotentes y mínimas: `LATE_PAYMENT_DETECTED`, `LATE_PAYMENT_CONFIRMED`.
  - **D11** Reorg vs conciliación: revertir estado on-chain sin borrar la decisión comercial histórica.
  - **D12** Atribución de cada Late Payment a invoice original + dirección derivada + wallet version.
- **Documento dedicado:** [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md).
- **Documentación relacionada:** [05-customer-payment-flow.md](./05-customer-payment-flow.md), [06-bitcoin-processing.md](./06-bitcoin-processing.md), [07-merchant-dashboard.md](./07-merchant-dashboard.md), [09-wallet-rotation.md](./09-wallet-rotation.md), [15-future-roadmap.md](./15-future-roadmap.md).
- **Dependencias:** ARCH-002 (derivación por invoice), ARCH-005 (monitoring por wallet version). No debe conflarse **index reconciliation** (ARCH-005, seguridad de asignación) con **payment reconciliation** (ARCH-006, qué ocurrió con los BTC recibidos).
- **Consideraciones futuras (fuera de MVP):** ejecución/firma de reembolsos on-chain, gestión de disputas, aceptación automática, decommission de wallet versions, deep-reorg. Extensiones de protocolo (Taproot, Multisig, Lightning, multi-wallet) permanecen **planificadas** en [15-future-roadmap.md](./15-future-roadmap.md).

---

## DB-001 — Merchant Wallet + Wallet Versions

- **Título:** Modelo de persistencia de Merchant Wallet + Wallet Versions.
- **Estado del diseño:** **Aprobado** (decisiones D1–D16). **Estado de implementación:** **Pendiente** (pertenece a DB-006).
- **Prioridad:** P0.
- **Resumen:**
  - Dos entidades: **`MerchantWallet`** (identidad lógica estable / linaje de Wallet Rotation) → **`MerchantWalletVersion`** (identidad de derivación pública inmutable + ciclo de vida) (**D1**).
  - MVP: exactamente **una** `MerchantWallet` por merchant (`UNIQUE(merchant_id)`) (**D2**); a lo sumo **una** versión `ACTIVE` por wallet, DB-enforced con índice parcial único (**D3**).
  - **Output Descriptor** canónico BIP84 incl. checksum como fuente de verdad (**D4**); `master_fingerprint` (**D5**), `derivation_path` (**D6**), `network` (**D7**) y `script_type` = **P2WPKH** MVP (**D8**) validados y consistentes con el Descriptor.
  - Versionado dual UUID + secuencia (**D9**); ciclo de vida **solo** `ACTIVE` / `RETIRED` (**D10**).
  - `recovery_state` diferido a DB-003 (**D11**); sin índice/cursor/HWM en DB-001 (**D12**); `UNIQUE(descriptor)` global, **no** `UNIQUE(descriptor_checksum)` (**D13**); atribución legacy vía `wallet_version_id = NULL` en DB-002 (**D14**); versiones usadas nunca borradas (**D15**); política de seguridad/privacidad del Descriptor (**D16**).
- **Documento dedicado:** [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md).
- **Documentación relacionada:** [03-merchant-onboarding.md](./03-merchant-onboarding.md), [08-wallet-recovery.md](./08-wallet-recovery.md), [09-wallet-rotation.md](./09-wallet-rotation.md), [11-security-model.md](./11-security-model.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md).
- **Dependencias:** ARCH-001 (Descriptor como fuente de verdad), ARCH-002 (metadata de wallet, rotación), ARCH-003 (Recovery Package), ARCH-005 D5/D10 (wallet version como dominio de reconciliación; paso 1 del orden de implementación).
- **Consideraciones futuras:** DB-002 (Allocation Ledger + relación `invoice ↔ wallet_version ↔ derivation_index`), DB-003 (Recovery State + monitoring), INFRA-001 (Durable HWM), DB-004 (Late Payment + conciliación), DB-006 (esquema Prisma + constraints + migraciones).

---

## DB-002 — Allocation Ledger

- **Título:** Allocation Ledger y relación `invoice ↔ wallet_version ↔ derivation_index`.
- **Estado del diseño:** **Aprobado** (decisiones D1–D17). **Estado de implementación:** **Pendiente** (pertenece a DB-006; el Durable HWM a INFRA-001).
- **Prioridad:** P0.
- **Resumen:**
  - Entidad conceptual **`WalletAddressAllocation`**: **consumo irrevocable** de un índice de derivación por wallet version + dirección derivada + atribución al invoice; **no** es un registro de transacción Bitcoin (**D1/D2**).
  - Sin máquina de estados de reserva: toda fila committeada es terminal, **`ATTRIBUTED`** (`payment_id NOT NULL`, `burn_reason NULL`) **XOR** **`BURNED`** (`payment_id NULL`, `burn_reason NOT NULL`, solo por reconciliación) (**D3/D4/D15**).
  - Índice `0 <= derivation_index < 2^31` (BigInt conceptual) (**D5**); `UNIQUE(wallet_version_id, derivation_index)` como never-reuse fundamental (**D6**); namespaces de índice independientes por wallet version.
  - `btc_address` derivada y **autoritativa** para el modelo non-custodial (**D7**); `UNIQUE(btc_address)` (**D8**); `Payment.btc_address` retenida transitoriamente (legacy/denormalizada), **no** eliminada en DB-002 (**D9**).
  - **Durable HWM** (INFRA-001) provee consumo **atómico monotónico** por wallet version; avanza **antes** del commit PostgreSQL y de la visibilidad de la dirección → un índice consumido-pero-no-committeado queda **quemado**, nunca reutilizado (**D10**).
  - **No** `MAX(ledger)+1` como autoridad; `ledger_max` es solo observabilidad; `candidate_index = previous_HWM+1` (normal) o `safe_next_index` (recovery); invariante `HWM(V) >= ledger_max(V)`; `ledger_max > HWM` ⇒ inconsistencia ⇒ fail-closed (**D11**).
  - Unicidad concurrente desde el HWM atómico; `UNIQUE(V,index)` como defensa en profundidad; advisory lock opcional (**D12**).
  - Append-only: expiración/cancelación/fallo/rotación nunca liberan un índice (**D13**).
  - Discriminador inmutable `Payment.receiving_model` (`SHARED_CUSTODIAL` / `NON_CUSTODIAL_DERIVED`); legacy = `SHARED_CUSTODIAL` + sin Allocation; sin wallet versions sintéticas (preserva DB-001 D14) (**D14**).
  - Identidad de Allocation inmutable; `BURNED` nunca se vuelve `ATTRIBUTED`; un `Payment` nunca se mueve entre Allocations (**D16**).
  - Direcciones públicas pero privacy-sensitive: privilegio mínimo, backups cifrados, sin logging/exposición masiva; **no** persistir `hwm_confirmed_at` (**D17**).
- **Documento dedicado:** [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md).
- **Documentación relacionada:** [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md), [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md), [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md), [04-payment-link-creation.md](./04-payment-link-creation.md), [06-bitcoin-processing.md](./06-bitcoin-processing.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md).
- **Dependencias:** DB-001 (ancla `wallet_version_id`), ARCH-002 (derivación forward-only por invoice), ARCH-005 D1/D2/D4/D5/D10 (Allocation Ledger + Durable HWM + fail-closed + dominio por wallet version + orden de implementación), ARCH-006 D6/D12 (N transacciones por invoice; atribución por wallet version).
- **Consideraciones futuras:** DB-003 (`recovery_state` + monitoring), INFRA-001 (tecnología del Durable HWM), DB-004 (clasificación de Late Payment + conciliación), DB-006 (esquema Prisma + enums + constraints + triggers + migraciones), migración del Worker al matching por `Allocation.btc_address`.

---

## DB-003 — Recovery State + Descriptor Monitoring

- **Título:** Recovery State + Descriptor Monitoring metadata (`MerchantWalletRecoveryState` + `MerchantWalletDescriptorMonitoring`).
- **Estado del diseño:** **Aprobado** (decisiones D1–D17). **Estado de implementación:** **Pendiente** (pertenece a DB-006; el Durable HWM a INFRA-001; el motor de reconciliación/establecimiento y las llamadas de Bitcoin Core al Worker/runtime).
- **Prioridad:** P0.
- **Resumen:**
  - **Dos entidades operativas dedicadas** — la persistencia de recovery/monitoring **no** se coloca en `MerchantWalletVersion` (**D1**); `MerchantWalletRecoveryState` (allocation-safety gate) y `MerchantWalletDescriptorMonitoring` (monitoring-coverage claim) son **separadas** (**D2**).
  - **Cardinalidad 1:1** por wallet version, ancladas por `wallet_version_id` (PK/FK); tanto ACTIVE como RETIRED las tienen (**D3**).
  - **Recovery State Machine** de **exactamente** cuatro estados: `RECOVERY_REQUIRED`, `RECONCILING`, `READY`, `RECOVERY_FAILED` (los mismos identificadores de ARCH-005 D6); sin estados inventados (**D4**).
  - **Establecimiento de seguridad inicial** unificado con reconciliación: nueva versión inicia fail-closed (`RECOVERY_REQUIRED` + `INITIAL_ESTABLISHMENT`); `READY` **solo** tras probar HWM baseline + `safe_next_index` + identidad de Descriptor (DB-001) + monitoring live-verificado; sin estado nuevo de onboarding (**D5**).
  - **Allocation gate:** asignar solo si `lifecycle == ACTIVE AND recovery_state == READY`; consumido por DB-002; ambigüedad ⇒ fail-closed; RETIRED nunca asigna (**D6**).
  - **Boundaries de monitoring:** ACTIVE `monitored_through_index >= safe_next_index + lookahead`; RETIRED `monitored_through_index >= HWM(V)` (derivado del Durable HWM; **sin** forward lookahead; **nunca** de `safe_next_index` ni de `MAX(ledger)`; **no** se escribe `HWM = safe_next_index - 1`) (**D7**).
  - Metadata mínima inline `state_reason` + `state_changed_at`; sin tabla de historial P0 (**D8**). Crash-safety sin `reconciliation_run_id` persistido: `recovery_state` + `lock_version` + advisory lock por wallet version; `RECONCILING` interrumpido → `RECOVERY_REQUIRED` (`RECONCILE_INTERRUPTED`), nunca auto→`READY`; `reconciliation_started_at` opcional (**D9**).
  - Monitoring metadata es **observabilidad/reclamación**; `VERIFIED` no prueba por sí solo la cobertura del runtime (**D10**); `monitored_through_index` avanza **solo** tras **live-verificación** contra el motor de runtime; nunca inferir cobertura desde PostgreSQL (**D11**).
  - `lookahead` es **configuración**; no se persiste `lookahead_size` (**D12/D13**). **No HWM mirror**: no persistir `HWM`, `safe_next_index`, `ledger_max`, `candidate_index`, `hwm_confirmed_at` (**D14**). Extensión de monitoring crash-safe sin `import_target_through_index` persistido; idempotentemente re-ejecutable; distinguir mecanismo de Bitcoin Core del requisito de arquitectura (**D15**).
  - Concurrencia: `lock_version` optimista + advisory lock por wallet version; **no** sustituye el consumo atómico del Durable HWM (**D16**).
  - Seguridad/privacidad: sin Seed/Private Keys; `state_reason` es código estructurado cerrado; `last_error` redactado; sin secretos/descriptors/RPC crudos (**D17**).
- **Documento dedicado:** [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md).
- **Documentación relacionada:** [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md), [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md), [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md), [08-wallet-recovery.md](./08-wallet-recovery.md), [09-wallet-rotation.md](./09-wallet-rotation.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md).
- **Dependencias:** DB-001 (ancla `wallet_version_id` + ciclo de vida ACTIVE/RETIRED), DB-002 (allocation gate consumida por el protocolo de asignación), ARCH-005 D4/D5/D6/D7 (fail-closed + dominio por wallet version + Recovery State Machine + invariante de lookahead), ARCH-006 D7/D12 (monitoring de versiones RETIRED para Late Payments), INFRA-001 (lectura del Durable HWM en reconciliación).
- **Consideraciones futuras:** INFRA-001 (tecnología/durabilidad del Durable HWM), DB-004 (clasificación de Late Payment + conciliación), DB-006 (esquema Prisma + enums + constraints 1:1 + triggers + migraciones), motor de reconciliación/establecimiento en runtime, migración del Worker del matching por dirección exacta al monitoring por rango de Descriptor, `reconciliation_run_id` y tabla de historial de transiciones como observabilidad post-MVP.

---

## INFRA-001 — Durable HWM

- **Título:** Durable HWM (High-Water Mark) — marca de agua autoritativa de consumo de índices de derivación, con ciclo de vida independiente del PostgreSQL operativo.
- **Estado del diseño:** **Aprobado** (decisiones D1–D24, con refinamientos **FINAL** en D2/D4/D7/D10/D11). **Estado de implementación:** **Pendiente** (provisión de la instancia PostgreSQL dedicada, abstracción `DurableHwmStore`, tablas, roles, PITR/backups independientes, runbook y tests).
- **Área:** Infra / Security. **Prioridad:** P0.
- **Resumen:**
  - **Tecnología (D1):** **instancia PostgreSQL dedicada** como primario P0; KV transaccional gestionado (CAS + idempotencia) como segunda opción/futuro; **Redis no** seleccionado como autoridad.
  - **Dominio de fallo independiente (D2 FINAL):** instancia PostgreSQL **dedicada** con **data directory, volumen, timeline WAL/PITR, backups y credenciales** propios; una **segunda base de datos en la instancia operativa es explícitamente insuficiente**; host/región separados = post-MVP hardening; residual de mismo host físico mitigado con volúmenes/restore/deletion-protection/never-backward/fail-closed.
  - **Semántica:** `HWM(V)` monotónico, never-reuse, namespace por wallet version, `-1` inicial (`establishBaseline` explícito) y primer consume `0`; fail-closed cuando no disponible o incierto.
  - **Consumo atómico (D6/D7 FINAL):** `consumeNext(walletVersionId, operationId)`; `operationId` **obligatorio**; **`UNIQUE(wallet_version_id, operation_id)`**; incremento + INSERT de operación en la **misma transacción**; duplicados concurrentes convergen a un índice vía rollback/retry; READ COMMITTED + row lock + reintento acotado (sin lock distribuido).
  - **Timeout ambiguo (D8):** reintento con el mismo `operationId` ⇒ mismo índice; irrecuperable ⇒ `RECOVERY_REQUIRED` + índice quemado.
  - **`generation` (D4 FINAL):** CAS/optimistic concurrency + guard monotónico-forward de `establishBaseline` + metadata de cross-check; **NO** detecta el rollback del propio store del HWM.
  - **Detección de rollback (D11 FINAL):** por **reconciliación contra evidencia aprobada** (Allocation Ledger / on-chain / Recovery Package), preservando `HWM(V) ≥ ledger_max(V)`; **no** por `generation`; **sin** segunda autoridad oculta.
  - **Restore:** Caso A (PostgreSQL operativo) rutinario/seguro — el HWM **no** se mueve hacia atrás; Caso B (HWM PostgreSQL) excepcional/fail-closed — baseline solo forward, con evidencia; Safety Range Burning quema índices inciertos.
  - **Durabilidad (D10 FINAL):** P0 = `synchronous_commit=on` + almacenamiento durable + PITR/backups independientes + deletion protection + never-backward restore + fail-closed; **standby síncrono = post-MVP hardening**, no requerido para la corrección de never-reuse.
  - **Seguridad (D17):** tres roles (consume / reconciliation / recovery-admin), privilegio mínimo, conectividad privada, TLS, cifrado en reposo, audit, deletion protection, alarmas. **Costo:** no hay nueva tecnología de DB, pero sí una **superficie operativa dedicada no despreciable** (no "zero new ops").
- **Documento dedicado:** [INFRA-001-durable-hwm.md](./INFRA-001-durable-hwm.md).
- **Documentación relacionada:** [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md), [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md), [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md).
- **Dependencias:** DB-001 (ancla `wallet_version_id`), ARCH-005 D2/D3/D4/D8/D10 (Durable HWM + Safety Range Burning + fail-closed + Recovery Package + orden de implementación), DB-002 D10/D11 (consumo atómico monotónico; `HWM(V) ≥ ledger_max(V)`), DB-003 D7 (`HWM(V)` como boundary de monitoring RETIRED).
- **Consideraciones futuras:** provisión real de PostgreSQL dedicado + roles + PITR (infra), DB-006 (esquema/migraciones), motor de reconciliación/establecimiento en runtime, adapter de KV transaccional gestionado, standby síncrono / HA, host/región separados, aprobación multi-parte de recovery-admin (post-MVP hardening).

---

## DB-004 — Late Payment + Merchant Reconciliation

- **Título:** Late Payment + Merchant Reconciliation — clasificación de timing/amount, conciliación del comercio y persistencia de la evidencia de observación on-chain (`PaymentReconciliation` + `ReconciliationAuditEvent` + extensión de `payment_btc_txs`).
- **Estado del diseño:** **Aprobado** (decisiones D1–D16, con refinamiento **FINAL** en D7). **Estado de implementación:** **Pendiente** (esquema Prisma + enums + constraints + `UNIQUE(txid, vout_index)` físico + migraciones en DB-006; first-seen confiable, manejo de reorg, dejar de descartar tx a invoices `EXPIRED`, migración del matching, motor de clasificación y dispatch en Worker/runtime).
- **Prioridad:** P0.
- **Resumen:**
  - **Granularidad de observación = outpoint** `(txid, vout_index)`; un `Payment` puede tener N outpoints; se **extiende** el `payment_btc_txs` existente en vez de crear una entidad paralela (**D1**).
  - **`PaymentReconciliation` opcional 1:1** con `Payment`, creada **lazily** solo para `LATE`/`INDETERMINATE`; la **ausencia** significa **solo** "nunca entró al workflow", sin estado implícito (**D2**).
  - **Timing** `ON_TIME | LATE | INDETERMINATE` (**D3**), **ortogonal** al **amount** `UNDERPAID | EXACT | OVERPAID` (**D4**); `INDETERMINATE` es un resultado conservador **válido**, no un fallo.
  - **Lifecycle inmutable:** un invoice `EXPIRED` **permanece** `EXPIRED` aunque llegue BTC tarde (**D5**, ARCH-006 D1/D4).
  - **First-seen confiable + provenance** persistidos para clasificación auditable/reproducible; el `detected_at` del Worker **no** es first-seen autoritativo automático; proveedor de runtime diferido, sin acople (**D6**).
  - **Máquina de estados FINAL:** `REVIEW_REQUIRED → { ACCEPTED, REJECTED }`; "sin acción" = `REVIEW_REQUIRED` (nunca `REJECTED`); **sin** `DISMISSED`, **sin** `REFUNDED_EXTERNALLY` como estado; reapertura a `REVIEW_REQUIRED` solo por evidencia/reorg preservando el historial (**D7 FINAL**).
  - **Historial de auditoría append-only** (acción, actor, timestamp, razón/contexto, reaperturas); el estado actual es una **proyección** (**D8**).
  - **Unicidad target global `UNIQUE(txid, vout_index)`**, no debilitada a por-`Payment`; DB-006 posee inspección legacy + migración + remediación + creación física; **no** existe aún (**D9**).
  - **Idempotencia:** observar el mismo outpoint repetidamente no crea atribución económica duplicada (**D10**). **Reorg** puede cambiar la proyección de cadena objetiva pero **no** borra el historial del comercio; `REORG_REVERTED` no es estado terminal permanente (**D11**).
  - **Múltiples outpoints** se agregan para el amount pero se preservan individualmente; sin tx sintética (**D12**). **Rotación/RETIRED** conserva la atribución histórica; `RETIRED` bloquea nuevas asignaciones pero no invalida late payments/conciliación históricos (**D13**).
  - DB-004 **no** es autoridad de Allocation Ledger, `derivation_index`, Durable HWM, `safe_next_index`, Recovery State ni Descriptor monitoring (**D14**). Legacy `SHARED_CUSTODIAL` **solo** usa evidencia que existe; sin `MerchantWalletVersion`/`WalletAddressAllocation`/`derivation_index` sintéticos (**D15**).
  - **Boundary non-custodial/financiero:** persiste evidencia, clasificación, conciliación y auditoría; **no** introduce private keys, custodia, reembolsos automáticos, exchange, conversión fiat, settlement ni ledger financiero general (**D16**).
- **Documento dedicado:** [DB-004-late-payment-merchant-reconciliation.md](./DB-004-late-payment-merchant-reconciliation.md).
- **Documentación relacionada:** [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md), [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md), [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md), [INFRA-001-durable-hwm.md](./INFRA-001-durable-hwm.md), [05-customer-payment-flow.md](./05-customer-payment-flow.md), [06-bitcoin-processing.md](./06-bitcoin-processing.md), [07-merchant-dashboard.md](./07-merchant-dashboard.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md), [16-glossary.md](./16-glossary.md).
- **Dependencias:** ARCH-006 D1–D12 (separación de dominios + timing/amount + conciliación + reorg + atribución por wallet version), DB-001 (ciclo de vida ACTIVE/RETIRED), DB-002 D2/D13/D14/D16/D20/D21 (atribución inmutable `Payment → Allocation → MerchantWalletVersion`, N tx por `Payment`, `receiving_model`), DB-003 D6/D7 (allocation-safety gate + monitoring de versiones RETIRED que habilita la detección de Late Payments), INFRA-001 (Durable HWM como entrada de solo lectura en la atribución).
- **Consideraciones futuras:** DB-006 (esquema Prisma + enums + constraints + `UNIQUE(txid, vout_index)` físico + inspección/remediación legacy + migraciones + triggers de inmutabilidad), Worker/runtime (proveedor de first-seen confiable, manejo de reorg, dejar de descartar tx a invoices `EXPIRED`, migración del matching a `Allocation.btc_address`, motor de clasificación, dispatch de notificaciones de Late Payment), y post-MVP: ejecución de reembolsos, disputas, workflows de deep-reorg y contabilidad.
