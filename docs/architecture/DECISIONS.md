# Resumen de decisiones de arquitectura

Este documento permite que un desarrollador nuevo entienda la arquitectura de FloweyPay en pocos minutos. Resume las decisiones aprobadas; para el detalle completo, ver los documentos referenciados.

---

## Filosofía del producto

- FloweyPay es un **procesador de pagos Bitcoin non-custodial**.
- **No es** una wallet, **no es** un custodio y **nunca** firma transacciones.
- Los pagos van **directamente** del cliente a una dirección controlada por el comercio.
- El comercio siempre posee su **Seed** y sus **Private Keys**.
- Ver [01-executive-summary.md](./01-executive-summary.md).

## Modelo de custodia

- **Cero custodia.** FloweyPay solo almacena información **pública**.
- Un compromiso total de FloweyPay **no puede** mover fondos del comercio; el peor caso es exposición de privacidad y disrupción del servicio.
- Ver [11-security-model.md](./11-security-model.md).

## Modelo de wallet

- El comercio aporta material **público** de su wallet: **Descriptor / XPUB / ZPUB**.
- Wallets **SUPPORTED**: Sparrow, Bitcoin Core Descriptor Wallet, Nunchuk.
- **VIA COORDINATOR**: Ledger + Sparrow, Trezor + Sparrow.
- **WITH LIMITATIONS**: Electrum, BlueWallet.
- **NOT SUPPORTED**: Ledger Live, Trezor Suite, exchanges custodiales, legacy, Wrapped SegWit, Multisig, Taproot (MVP).
- Ver [ARCH-003 en 14-architecture-decisions.md](./14-architecture-decisions.md).

## Filosofía de Direcciones

- Una dirección única por invoice.
- Nunca reutilizar direcciones.
- La privacidad del merchant depende de esta regla.

## Modelo de Descriptor

- El **Output Descriptor** validado por checksum es la **fuente de verdad** interna.
- Toda entrada se normaliza a la forma canónica BIP84:
  `wpkh([fingerprint/84h/coin_typeh/accounth]xpub/0/*)#checksum`.
- Solo **P2WPKH / BIP84 / Native SegWit** en el MVP.
- **Bitcoin Core** valida checksum y deriva direcciones.
- Ver [03-merchant-onboarding.md](./03-merchant-onboarding.md).

## Derivación de direcciones

- **Una dirección única por invoice**.
- Índices **forward-only** y **nunca reutilizados**.
- **Reserva atómica** del índice.
- Solo la **External receive chain** (`0/*`).
- Path: `m/84'/coin_type'/account'/0/index` (coin type `0'` mainnet, `1'` signet/testnet/regtest).
- Ver [04-payment-link-creation.md](./04-payment-link-creation.md).

## Estrategia de recuperación

- **Recovery Package** firmado y Watch-only con: Descriptor, Fingerprint, Derivation Path, Network, último índice asignado, último índice fondeado, rango de importación recomendado, historial de Wallet Rotation y firma.
- **Gap recovery** para invoices impagos que exceden el Gap Limit (por defecto 20).
- **Independencia de FloweyPay**: el comercio recupera fondos con su Seed, sin depender de FloweyPay.
- Ver [08-wallet-recovery.md](./08-wallet-recovery.md).

## Reconciliación de índices y Backup Recovery (ARCH-005 — diseño aprobado)

- Diseño **aprobado** (D1–D10); implementación **pendiente**.
- La fórmula preliminar `max(DB, registros de pago, índice fondeado on-chain) + 1` **no es suficiente**: la cadena no puede probar que un índice **no fondeado** fue asignado históricamente.
- **Durable High-Water Mark (HWM)** monotónico, con ciclo de persistencia independiente del rollback de la DB, protege contra la reutilización de índices asignados-pero-no-fondeados.
- **Allocation Ledger** en la DB operativa para trazabilidad/auditoría.
- **Fail-closed**: sin `safe_next_index` probado, se bloquea la asignación. Reconciliación **por wallet version** con una **Recovery State Machine** idempotente.
- Ver [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md).

## Late Payments y conciliación (ARCH-006 — diseño aprobado)

- Diseño **aprobado** (D1–D12); implementación **pendiente**.
- Principio: FloweyPay **registra lo que ocurrió en Bitcoin**, **preserva lo que ocurrió con el invoice** y **deja la interpretación comercial al comercio**. Non-custodial: no rechaza, revierte, reembolsa ni mueve fondos.
- **Separación de dominios**: Invoice lifecycle, Bitcoin payment/on-chain lifecycle, clasificación de timing/amount y conciliación del comercio son dimensiones **ortogonales**. Un Late Payment **no** se modela como `EXPIRED → PAID`; el invoice permanece `EXPIRED`.
- **Timing** (`ON_TIME | LATE | INDETERMINATE`) se decide por el **first-seen** más temprano confiable vs `expires_at`, nunca por block timestamp/confirmación/recovery. **Amount** (`UNDERPAID | EXACT | OVERPAID`) es independiente del timing; `expected_amount` inmutable.
- **Sin aceptación automática**: `EXACT` no implica `ACCEPTED`; el comercio concilia (ACCEPT / DISMISS / ADD NOTE / RECORD EXTERNAL REFUND), con auditoría (acción/actor/timestamp).
- **N transacciones por invoice**; el Payment Link expirado deja de ser pagable; notificaciones idempotentes (`LATE_PAYMENT_DETECTED`, `LATE_PAYMENT_CONFIRMED`); atribución por wallet version; reorg no borra la decisión comercial.
- Depende del monitoring por wallet version de ARCH-005; **no** confundir index reconciliation (ARCH-005) con payment reconciliation (ARCH-006).
- Ver [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md).

## Soporte de wallets

- Verificación **obligatoria de Address #0** antes de activar cualquier wallet.
- Los hardware wallets se soportan **vía coordinador (Sparrow)** para lograr verificación on-device.
- Descriptor monitoring por rangos, adelantado a la asignación.
- Ver [ARCH-003](./14-architecture-decisions.md).

## Principios de seguridad

- FloweyPay **nunca** almacena Seeds ni Private Keys.
- El Descriptor/XPUB es el artefacto **más sensible a la privacidad** (revela todo el historial de direcciones y facturación).
- Entrada del comercio tratada como no confiable; validación estricta vía Bitcoin Core.
- Ver [11-security-model.md](./11-security-model.md).

## Modelo de persistencia de wallet (DB-001 — diseño aprobado)

- Diseño **aprobado** (D1–D16); implementación **pendiente** (DB-006).
- Dos entidades: **`MerchantWallet`** (identidad lógica estable / linaje de **Wallet Rotation**) → **`MerchantWalletVersion`** (identidad de derivación pública **inmutable** + ciclo de vida).
- **MVP:** exactamente **una** `MerchantWallet` por merchant (`UNIQUE(merchant_id)`); a lo sumo **una** versión **`ACTIVE`** por wallet (índice parcial único de PostgreSQL).
- **Fuente de verdad:** el **Output Descriptor** canónico BIP84 **incluyendo checksum**. `descriptor_checksum` es metadata derivada/validada, **no** un identificador único. `master_fingerprint`, `derivation_path`, `network` y `script_type` (**P2WPKH** en MVP) se validan y deben ser mutuamente consistentes con el Descriptor.
- **Ciclo de vida:** solo **`ACTIVE`** / **`RETIRED`** (`ACTIVE → RETIRED` one-way); las versiones `RETIRED` permanecen persistidas, atribuibles y monitorizables. La **Wallet Rotation** crea una **nueva** versión; nunca muta la identidad de derivación existente.
- **Unicidad:** el Descriptor canónico completo es **globalmente único** (`UNIQUE(descriptor)`); **no** hay `UNIQUE(descriptor_checksum)`.
- **Fuera de DB-001:** Allocation Ledger e índices de derivación (DB-002), `recovery_state` + monitoring (DB-003), Durable HWM (INFRA-001), Late Payment + conciliación (DB-004), esquema/migraciones (DB-006). DB-001 solo provee el `wallet_version_id` estable que esas tareas referencian; **no** reintroduce un `next_index` mutable como autoridad de asignación.
- Ver [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md).

## Allocation Ledger (DB-002 — diseño aprobado)

- Diseño **aprobado** (D1–D17); implementación **pendiente** (DB-006; Durable HWM en INFRA-001). Materializa la relación `invoice ↔ wallet_version ↔ derivation_index`.
- Entidad conceptual **`WalletAddressAllocation`**: **consumo irrevocable** de un índice de derivación por **wallet version** + **dirección derivada** + **atribución al invoice**. **No** es un registro de transacción Bitcoin; una Allocation/dirección puede recibir **0..N** transacciones.
- **Never-reuse fundamental:** un índice **durablemente consumido** por el **Durable HWM** nunca se reasigna; un índice **quemado (BURNED)** es aceptable, un índice **reutilizado** no. **SAFETY > INDEX DENSITY.** La expiración/cancelación/fallo/rollback/restore/rotación **nunca** liberan un índice.
- **Sin máquina de estados de reserva:** toda fila committeada es terminal — **`ATTRIBUTED`** (`payment_id NOT NULL`, `burn_reason NULL`; escrita atómicamente con el `Payment`) **XOR** **`BURNED`** (`payment_id NULL`, `burn_reason NOT NULL`; **solo** materializada por reconciliación). `CHECK ((payment_id IS NOT NULL) <> (burn_reason IS NOT NULL))`.
- **Índice:** `0 <= derivation_index < 2^31` (BigInt conceptual); `UNIQUE(wallet_version_id, derivation_index)`; namespaces independientes por wallet version (V1/index 0 y V2/index 0 coexisten).
- **Dirección:** `WalletAddressAllocation.btc_address` derivada y **autoritativa** para non-custodial; `UNIQUE(btc_address)`; `Payment.btc_address` se retiene como legacy/copia denormalizada y **no** se elimina en DB-002.
- **Durable HWM (INFRA-001):** consumo **atómico monotónico** por wallet version; avanza **antes** del commit PostgreSQL y de la visibilidad de la dirección. `MAX(ledger)+1` **no** es autoridad; `ledger_max` es solo observabilidad; `candidate_index = previous_HWM+1` (normal) o `safe_next_index` (recovery); `HWM(V) >= ledger_max(V)`; discrepancia ⇒ **fail-closed / RECOVERY_REQUIRED**. PostgreSQL **no** es prueba autoritativa del HWM; **no** se persiste `hwm_confirmed_at`.
- **Discriminador legacy:** `Payment.receiving_model` inmutable (`SHARED_CUSTODIAL` / `NON_CUSTODIAL_DERIVED`); legacy = `SHARED_CUSTODIAL` + sin Allocation + `Payment.btc_address` (válido); `NON_CUSTODIAL_DERIVED` + Allocation faltante = inválido; sin wallet versions sintéticas (preserva DB-001 D14).
- **Fuera de DB-002:** `recovery_state` + monitoring/lookahead (DB-003), tecnología/durabilidad del Durable HWM (INFRA-001), clasificación de Late Payment + conciliación del comercio (DB-004), esquema Prisma + enums + constraints + triggers + migraciones (DB-006), migración del Worker al matching por `Allocation.btc_address`.
- Ver [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md).

## Recovery State + Descriptor Monitoring (DB-003 — diseño aprobado)

- Diseño **aprobado** (D1–D17); implementación **pendiente** (DB-006; Durable HWM en INFRA-001; motor de reconciliación/establecimiento y llamadas de Bitcoin Core en Worker/runtime).
- **Dos entidades operativas separadas y 1:1** por wallet version, ancladas por `wallet_version_id` (PK/FK): **`MerchantWalletRecoveryState`** (la **allocation-safety gate**) y **`MerchantWalletDescriptorMonitoring`** (la **monitoring-coverage claim**). **No** se combinan y **no** se colocan sobre `MerchantWalletVersion`.
- **Recovery State Machine** de **exactamente** cuatro estados: `RECOVERY_REQUIRED`, `RECONCILING`, `READY`, `RECOVERY_FAILED` (los mismos identificadores de ARCH-005 D6). Sin estados inventados.
- **Establecimiento de seguridad inicial** unificado con la reconciliación: una versión nueva inicia fail-closed (`RECOVERY_REQUIRED` + `INITIAL_ESTABLISHMENT`), **no** semánticamente "recovering"; alcanza `READY` **solo** tras probar HWM baseline + `safe_next_index` + identidad de Descriptor (DB-001) + monitoring live-verificado.
- **Allocation gate:** asignar solo si `lifecycle == ACTIVE AND recovery_state == READY` (consumido por el protocolo de DB-002); ambigüedad ⇒ fail-closed; RETIRED nunca asigna.
- **Monitoring es una reclamación:** `monitoring_status = VERIFIED` no prueba por sí solo la cobertura del runtime; `monitored_through_index` avanza **solo** tras **live-verificación** contra el motor de runtime; nunca se infiere cobertura desde PostgreSQL. Bitcoin Core es el **effective runtime monitoring engine** (reconstruible; **no** autoridad durable).
- **Boundary ACTIVE:** `monitored_through_index >= safe_next_index + lookahead`. **Boundary RETIRED:** `monitored_through_index >= HWM(V)` (derivado del Durable HWM; **sin** forward lookahead; **nunca** de `safe_next_index` ni de `MAX(ledger)`; **no** se escribe `HWM = safe_next_index - 1`).
- **No HWM mirror:** DB-003 **no** persiste `HWM`, `safe_next_index`, `ledger_max`, `candidate_index`, `hwm_confirmed_at`, `lookahead_size` (configuración), `monitored_from_index`, `import_target_through_index` ni `reconciliation_run_id` (P0). Metadata mínima inline (`state_reason` + `state_changed_at`); crash-safety idempotente vía `lock_version` + advisory lock por wallet version; `RECONCILING` interrumpido → `RECOVERY_REQUIRED` (`RECONCILE_INTERRUPTED`), nunca auto→`READY`.
- **Fuera de DB-003:** Durable HWM (INFRA-001), Allocation Ledger + `derivation_index` (DB-002), identidad/Descriptor (DB-001), Late Payment + conciliación (DB-004), esquema Prisma + enums + constraints + triggers + migraciones (DB-006), motor de reconciliación en runtime.
- Ver [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md).

## Roadmap futuro

- **ARCH-005 (diseño aprobado; implementación pendiente):** reconciliación de índices y Backup Recovery (Durable HWM, Allocation Ledger, fail-closed, Recovery State Machine).
- **ARCH-006 (diseño aprobado; implementación pendiente):** política de Late Payments y conciliación (separación de dominios, timing/amount, conciliación del comercio, link expirado no pagable). Extensiones de protocolo (Taproot, Multisig, Lightning, multi-wallet) permanecen **planificadas**.
- Ver [15-future-roadmap.md](./15-future-roadmap.md).

---

> **Observación.** El código actual asigna direcciones desde una wallet compartida de Bitcoin Core (custodial hoy). El modelo non-custodial por Descriptor descrito aquí es el objetivo aprobado. Ver observaciones consolidadas en [12-operational-flow.md](./12-operational-flow.md).
