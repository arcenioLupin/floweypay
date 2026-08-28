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

## Versión 1.4 — DB-001: Merchant Wallet + Wallet Versions (Diseño aprobado)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición de diseño de persistencia (solo diseño; **no** representa implementación completada). Construye sobre ARCH-001…006 sin rediseñarlas:

- **DB-001** — Merchant Wallet + Wallet Versions. Aprobadas las decisiones **D1–D16**: dos entidades `MerchantWallet` → `MerchantWalletVersion`; MVP con **una** wallet por merchant (`UNIQUE(merchant_id)`) y a lo sumo **una** versión `ACTIVE` por wallet (índice parcial único); **Output Descriptor** canónico BIP84 incl. checksum como fuente de verdad; `master_fingerprint`, `derivation_path`, `network` y `script_type` (**P2WPKH** MVP) validados y consistentes; versionado UUID + secuencia; ciclo de vida **solo** `ACTIVE`/`RETIRED`; inmutabilidad de la identidad de derivación tras activación; `UNIQUE(descriptor)` global (**no** `UNIQUE(descriptor_checksum)`); versiones usadas nunca borradas; política de seguridad/privacidad del Descriptor con cifrado a nivel de columna **diferido**.
- **Explícitamente fuera de DB-001:** Allocation Ledger e índices de derivación (**DB-002**), Recovery State + monitoring (**DB-003**), Durable HWM (**INFRA-001**), Late Payment + conciliación (**DB-004**), esquema Prisma + constraints + migraciones (**DB-006**).
- La **implementación** (esquema, constraints PostgreSQL, migraciones) **permanece pendiente** (DB-006). Hoy el repositorio no contiene aún tablas `MerchantWallet`/`MerchantWalletVersion` ni persistencia de Descriptor.

Documentación asociada: [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md), [ADR.md § DB-001](./ADR.md#db-001--merchant-wallet--wallet-versions), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md), [16-glossary.md](./16-glossary.md).

---

## Versión 1.5 — DB-002: Allocation Ledger (Diseño aprobado)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición de diseño de persistencia (solo diseño; **no** representa implementación completada). Construye sobre ARCH-001…006 y DB-001 sin rediseñarlas:

- **DB-002** — Allocation Ledger y relación `invoice ↔ wallet_version ↔ derivation_index`. Aprobadas las decisiones **D1–D17**: entidad conceptual `WalletAddressAllocation` como **consumo irrevocable** de índice de derivación por wallet version + dirección derivada + atribución al invoice (**no** es un registro de transacción Bitcoin); sin máquina de estados de reserva — toda fila committeada es terminal `ATTRIBUTED` **XOR** `BURNED` (`CHECK` XOR), con `BURNED` (`payment_id NULL` + `burn_reason`) materializado **solo** por reconciliación; `0 <= derivation_index < 2^31`; `UNIQUE(wallet_version_id, derivation_index)` (never-reuse) + `UNIQUE(btc_address)` + `UNIQUE(payment_id)`; `Allocation.btc_address` **autoritativa** para non-custodial con `Payment.btc_address` retenida transitoriamente (legacy/denormalizada, **no** eliminada); **Durable HWM** (INFRA-001) con consumo atómico monotónico que avanza **antes** del commit PostgreSQL y de la visibilidad de la dirección → índice consumido-pero-no-committeado **quemado** y nunca reutilizado; **no** `MAX(ledger)+1` como autoridad (`ledger_max` solo observabilidad; `candidate = previous_HWM+1` normal o `safe_next_index` en recovery; `HWM(V) >= ledger_max(V)`; discrepancia ⇒ fail-closed); discriminador inmutable `Payment.receiving_model` (`SHARED_CUSTODIAL` / `NON_CUSTODIAL_DERIVED`) sin wallet versions sintéticas (preserva DB-001 D14); append-only (expiración/cancelación/fallo/rotación nunca liberan un índice); identidad de Allocation inmutable (`BURNED` nunca se vuelve `ATTRIBUTED`; un `Payment` nunca se mueve entre Allocations); direcciones privacy-sensitive sin `hwm_confirmed_at`.
- **Explícitamente fuera de DB-002:** `recovery_state` + monitoring/lookahead (**DB-003**), tecnología/durabilidad del Durable HWM (**INFRA-001**), clasificación de Late Payment + conciliación del comercio (**DB-004**), esquema Prisma + enums + constraints + triggers + migraciones (**DB-006**), migración del Worker al matching por `Allocation.btc_address`.
- La **implementación** (tabla `WalletAddressAllocation`, `receiving_model`, constraints PostgreSQL, triggers de inmutabilidad, Durable HWM atómico, migraciones) **permanece pendiente**. Hoy el repositorio aún deriva direcciones desde una **única wallet compartida** de Bitcoin Core (`getnewaddress`) y no contiene Allocation Ledger, atribución `wallet_version ↔ derivation_index`, Durable HWM ni `receiving_model`.

Documentación asociada: [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [ADR.md § DB-002](./ADR.md#db-002--allocation-ledger), [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md), [16-glossary.md](./16-glossary.md).

---

## Versión 1.6 — DB-003: Recovery State + Descriptor Monitoring (Diseño aprobado)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición de diseño de persistencia (solo diseño; **no** representa implementación completada). Construye sobre ARCH-001…006, DB-001 y DB-002 sin rediseñarlas:

- **DB-003** — Recovery State + Descriptor Monitoring metadata. Aprobadas las decisiones **D1–D17**: dos entidades operativas **separadas** y **1:1** por wallet version — `MerchantWalletRecoveryState` (la **allocation-safety gate**) y `MerchantWalletDescriptorMonitoring` (la **monitoring-coverage claim**), ancladas por `wallet_version_id` (PK/FK); **Recovery State Machine** de **exactamente** cuatro estados (`RECOVERY_REQUIRED`, `RECONCILING`, `READY`, `RECOVERY_FAILED`, los mismos identificadores de ARCH-005 D6); **establecimiento de seguridad inicial** unificado con la reconciliación (nueva versión inicia fail-closed `RECOVERY_REQUIRED` + `INITIAL_ESTABLISHMENT`; `READY` **solo** tras probar HWM baseline + `safe_next_index` + monitoring live-verificado); **allocation gate** = `lifecycle == ACTIVE AND recovery_state == READY` (RETIRED nunca asigna); boundaries de monitoring — ACTIVE: `monitored_through_index >= safe_next_index + lookahead`, RETIRED: `monitored_through_index >= HWM(V)` (derivado del Durable HWM; **sin** forward lookahead; **nunca** de `safe_next_index` ni de `MAX(ledger)`); `monitored_through_index` es una **reclamación** que solo avanza tras **live-verificación** contra el motor de runtime; Bitcoin Core como **effective runtime monitoring engine** reconstruible y **no** autoridad durable; concurrencia por `lock_version` optimista + advisory lock por wallet version; metadata mínima inline (`state_reason` + `state_changed_at`), sin tabla de historial P0; `state_reason` con **vocabulario estructurado cerrado**; crash-safety sin `reconciliation_run_id` ni `import_target_through_index` persistidos; sin Seed/Private Keys.
- **DB-003 NO persiste** (por diseño): `HWM`, `safe_next_index`, `ledger_max`, `candidate_index`, `hwm_confirmed_at`, `lookahead_size`, `monitored_from_index`, `import_target_through_index`, `reconciliation_run_id` (P0) ni un duplicado del Descriptor canónico.
- **Explícitamente fuera de DB-003:** Durable HWM/durabilidad (**INFRA-001**), Allocation Ledger + `derivation_index` (**DB-002**), identidad/Descriptor de wallet (**DB-001**), clasificación de Late Payment + conciliación (**DB-004**), esquema Prisma + enums + constraints + triggers + migraciones (**DB-006**), motor de reconciliación/establecimiento en runtime y llamadas de Bitcoin Core.
- La **implementación** (modelos Prisma, enums, constraints 1:1, motor de reconciliación, monitoring por rango de Descriptor con live-verificación) **permanece pendiente**. Hoy el repositorio aún deriva direcciones desde una **única wallet compartida** de Bitcoin Core (`getnewaddress`), el Worker hace matching por **dirección exacta** contra `payments.btc_address`, y no existe ningún `recovery_state` ni metadata de Descriptor monitoring.

Documentación asociada: [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md), [ADR.md § DB-003](./ADR.md#db-003--recovery-state--descriptor-monitoring), [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md), [16-glossary.md](./16-glossary.md).

---

## Versión 1.7 — INFRA-001: Durable HWM (Diseño aprobado con refinamientos)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición de diseño de infraestructura/seguridad (solo diseño; **no** representa implementación completada). Construye sobre ARCH-001…006, DB-001, DB-002 y DB-003 sin rediseñarlas:

- **INFRA-001** — Durable HWM (High-Water Mark). Aprobadas las decisiones **D1–D24**, con refinamientos **FINAL** en **D2/D4/D7/D10/D11**: **marca de agua autoritativa de consumo** de índices de derivación por wallet version, con **ciclo de vida independiente del PostgreSQL operativo**; **instancia PostgreSQL dedicada** como primario P0 (data directory, volumen, WAL/PITR, backups y credenciales propios) — una **segunda base de datos en la instancia operativa es explícitamente insuficiente**, host/región separados = post-MVP hardening; `HWM(V)` monotónico never-reuse con `-1` inicial (`establishBaseline` explícito) y primer consume `0`; consumo atómico `consumeNext(walletVersionId, operationId)` con `operationId` **obligatorio**, **`UNIQUE(wallet_version_id, operation_id)`** e incremento + INSERT de operación en la **misma transacción** (duplicados concurrentes convergen a un índice vía rollback/retry; READ COMMITTED + row lock + reintento acotado; sin lock distribuido); timeout ambiguo resuelto por idempotencia (mismo `operationId` ⇒ mismo índice); `generation` para **CAS/guard monotónico-forward/cross-check** y **NO** como detector de rollback del propio store; **detección de rollback** del HWM vía reconciliación contra evidencia aprobada (Allocation Ledger / on-chain / Recovery Package, `HWM(V) >= ledger_max(V)`); restore del PostgreSQL operativo (Caso A) rutinario/seguro y restore del HWM (Caso B) excepcional/**fail-closed** con baseline solo forward + Safety Range Burning; durabilidad P0 = `synchronous_commit=on` + almacenamiento durable + PITR/backups independientes + deletion protection + never-backward restore + fail-closed, con **standby síncrono como post-MVP hardening** (no requerido para la corrección de never-reuse); tres roles (consume / reconciliation / recovery-admin) con privilegio mínimo; abstracción estrecha `DurableHwmStore` (librería, **no** microservicio); solo el path de creación de pagos avanza el HWM (Worker solo lectura); aislamiento por entorno; observabilidad sin valores crudos del HWM.
- **Redacción corregida:** el PostgreSQL dedicado **no** es "zero new ops" — no hay nueva tecnología de DB pero sí una **superficie operativa dedicada no despreciable**.
- **Explícitamente fuera de INFRA-001:** Allocation Ledger + `derivation_index` (**DB-002**), Recovery State + monitoring (**DB-003**), identidad/Descriptor de wallet (**DB-001**), esquema Prisma + enums + constraints + migraciones (**DB-006**), provisión real de PostgreSQL, motor de reconciliación/establecimiento en runtime y llamadas de Bitcoin Core.
- La **implementación** (provisión de la instancia PostgreSQL dedicada, `DurableHwmStore`, tablas `durable_hwm`/`hwm_consume_ops`, roles, PITR/backups independientes, runbook de recovery, tests) **permanece pendiente**. Hoy el repositorio aún deriva direcciones desde una **única wallet compartida** de Bitcoin Core (`getnewaddress`), usa una **única** instancia PostgreSQL operativa y **no** contiene ningún mecanismo de Durable HWM.

Documentación asociada: [INFRA-001-durable-hwm.md](./INFRA-001-durable-hwm.md), [ADR.md § INFRA-001](./ADR.md#infra-001--durable-hwm), [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md), [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md), [16-glossary.md](./16-glossary.md).

---

## Versión 1.8 — DB-004: Late Payment + Merchant Reconciliation (Diseño aprobado)

Estado: **Aprobado (diseño); implementación pendiente**.

Adición de diseño de persistencia (solo diseño; **no** representa implementación completada). Construye sobre ARCH-001…006, DB-001, DB-002, DB-003 e INFRA-001 sin rediseñarlas:

- **DB-004** — Late Payment + Merchant Reconciliation. Aprobadas las decisiones **D1–D16**, con refinamiento **FINAL** en **D7**: **granularidad de observación = outpoint** `(txid, vout_index)` con N outpoints por `Payment`, extendiendo el `payment_btc_txs` existente (**D1**); **clasificación de timing** `ON_TIME | LATE | INDETERMINATE` (**D3**) **ortogonal** a la de **amount** `UNDERPAID | EXACT | OVERPAID` (**D4**), siendo `INDETERMINATE` un resultado conservador **válido** (no un fallo); **lifecycle inmutable** (un invoice `EXPIRED` **permanece** `EXPIRED` aunque llegue BTC tarde, **D5**); **first-seen confiable + provenance** persistidos para clasificación auditable/reproducible, con el `detected_at` del Worker **no** autoritativo por sí solo y contrato `first_seen ≤ expires_at ⇒ ON_TIME`, `first_seen > expires_at ⇒ LATE`, evidencia insuficiente `⇒ INDETERMINATE`, recovery/offline **observation-neutral** (**D6**); **`PaymentReconciliation` opcional 1:1** creada **lazily** solo para `LATE`/`INDETERMINATE`, cuya **ausencia** significa **solo** "nunca entró al workflow" sin estado implícito (**D2**); **máquina de estados FINAL** `REVIEW_REQUIRED → { ACCEPTED, REJECTED }` donde "sin acción" = `REVIEW_REQUIRED` (nunca `REJECTED`), **sin** `DISMISSED` y **sin** `REFUNDED_EXTERNALLY` como estado (el reembolso externo es a lo sumo una anotación record-only), con reapertura a `REVIEW_REQUIRED` solo por evidencia/reorg (**D7 FINAL**); **historial de auditoría append-only** con el estado actual como proyección (**D8**); invariante target **`UNIQUE(txid, vout_index)` global** (no debilitada a por-`Payment`), cuya inspección legacy + migración segura + remediación + creación física pertenecen a **DB-006** (**D9**); **idempotencia** (observar el mismo outpoint repetidamente no crea atribución económica duplicada, **D10**); **reorg** que puede cambiar la proyección de cadena objetiva (`observation_status`, confirmaciones, bloque) pero **nunca** borra el historial del comercio, con `REORG_REVERTED` no terminal (**D11**); **múltiples outpoints** agregados para el amount pero preservados individualmente sin tx sintética (**D12**); **rotación/RETIRED** que conserva la atribución histórica vía DB-002 (**D13**).
- **Explícitamente fuera de DB-004:** DB-004 **no** es autoridad de Allocation Ledger, `derivation_index`, Durable HWM, `safe_next_index`, Recovery State ni Descriptor monitoring (**D14**); legacy `SHARED_CUSTODIAL` **solo** usa evidencia que existe, sin `MerchantWalletVersion`/`WalletAddressAllocation`/`derivation_index` sintéticos (**D15**); **no** introduce private keys, custodia, reembolsos automáticos, exchange, conversión fiat, settlement, contabilidad ni ledger financiero general (**D16**). Esquema Prisma + enums + constraints + `UNIQUE(txid, vout_index)` físico + migraciones + triggers de inmutabilidad = **DB-006**; proveedor de first-seen confiable + manejo de reorg + dejar de descartar tx a invoices `EXPIRED` + migración del matching + motor de clasificación + dispatch de notificaciones = **Worker/runtime**; Allocation Ledger + `derivation_index` = **DB-002**; Recovery State + monitoring = **DB-003**; identidad/Descriptor = **DB-001**; Durable HWM = **INFRA-001**.
- La **implementación** (modelos Prisma `PaymentReconciliation`/`ReconciliationAuditEvent`, extensión de `payment_btc_txs` con first-seen/provenance/`observation_status`/asociación de bloque, enums, constraints, la unicidad global `UNIQUE(txid, vout_index)`, migraciones, motor de clasificación y conciliación) **permanece pendiente**. Hoy el repositorio aún deriva direcciones desde una **única wallet compartida** de Bitcoin Core, el Worker **descarta** transacciones a invoices `EXPIRED` y hace matching por **dirección exacta**, `payment_btc_txs.detected_at` es tiempo de observación del Worker (no reloj de negocio), la unicidad es `UNIQUE(payment_id, txid, vout_index)` y **no** existe ninguna clasificación timing/amount ni conciliación del comercio.

Documentación asociada: [DB-004-late-payment-merchant-reconciliation.md](./DB-004-late-payment-merchant-reconciliation.md), [ADR.md § DB-004](./ADR.md#db-004--late-payment--merchant-reconciliation), [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md), [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md), [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md), [14-architecture-decisions.md](./14-architecture-decisions.md), [15-future-roadmap.md](./15-future-roadmap.md), [16-glossary.md](./16-glossary.md).

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
