# 14 — Decisiones de arquitectura

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [13 — Diagramas de secuencia](./13-sequence-diagrams.md).

Resumen de todas las decisiones aprobadas y la razón de cada una. Índice formal en [ADR.md](./ADR.md).

---

## ARCH-001 — Output Descriptor como fuente de verdad y onboarding

| Decisión | Por qué existe |
|---|---|
| Fuente de verdad interna = **Output Descriptor** validado por checksum | Representación inequívoca y auto-verificable del espacio de direcciones de una wallet. |
| Aceptar **Descriptor / XPUB / ZPUB** | Interoperar con exportaciones de wallets del mundo real. |
| Normalizar a Descriptor **BIP84** | Una única forma interna canónica sin importar la entrada. |
| Solo **P2WPKH / BIP84** (MVP) | Acotar el alcance; script type más simple, de menor riesgo y ampliamente soportado. |
| **Verificación de Address #0 obligatoria** | Demuestra control de claves; previene errores de cuenta/script equivocado. |
| **Bitcoin Core valida** | Motor autoritativo de Descriptor/checksum/derivación. |

## ARCH-002 — Derivación y seguridad operativa

| Decisión | Por qué existe |
|---|---|
| **Una dirección por invoice** | Conciliación determinista + privacidad. |
| **Índices forward-only, nunca reutilizados** | Prevenir colisiones de pago y filtración de historial. |
| **Reserva atómica de índice** | Seguridad bajo concurrencia. |
| **Solo External receive chain** | Las direcciones de recepción viven en la rama `0/*`. |
| **Path de derivación BIP84** | `m/84'/coin'/account'/0/index`. |
| **Almacenar metadata de la wallet** | Habilita monitoring, recuperación y auditoría. |
| **Estrategia de Gap recovery** | Manejar Gaps grandes de invoices impagos por encima del límite por defecto (20). |
| **Descriptor monitoring / observar adelantado** | Detectar pagos antes de que la asignación alcance un índice. |
| **Wallet Rotation** | Los comercios pueden migrar de forma segura. |
| **Backup reconciliation** | Seguro ante restauración; nunca reasignar índices usados. |

## ARCH-003 — Wallets soportadas y Recovery Package

| Decisión | Por qué existe |
|---|---|
| SUPPORTED: Sparrow, Bitcoin Core, Nunchuk | Nativos de descriptors; metadata completa + verificación. |
| VIA COORDINATOR: Ledger/Trezor + Sparrow | Verificación más fuerte (on-device), exportación limpia del Descriptor. |
| WITH LIMITATIONS: Electrum, BlueWallet | El ZPUB carece de metadata adjunta; requiere reconstrucción + verificación. |
| NOT SUPPORTED: Ledger Live, Trezor Suite, custodiales, legacy, Wrapped SegWit, Multisig, Taproot (MVP) | Exportación impráctica o script types fuera de alcance. |
| **Recovery Package firmado Watch-only** | Garantiza la independencia de recuperación del comercio. |

## ARCH-004 — Especificación de arquitectura funcional

| Decisión | Por qué existe |
|---|---|
| Documentar el flujo completo Merchant → Customer → Bitcoin → Confirmation | Fuente única, independiente de la implementación, para todos los perfiles. |
| Consolidar ARCH-001/002/003 en comportamiento funcional | Alinear a desarrollo, QA, seguridad y auditoría sobre un mismo contrato funcional. |

---

## ARCH-005 — Index Reconciliation & Backup Recovery

> **Estado del diseño: Aprobado** (D1–D10). **Implementación: pendiente.** Documento dedicado: [ARCH-005-index-reconciliation-recovery.md](./ARCH-005-index-reconciliation-recovery.md).

La fórmula preliminar `next_index = max(DB, registros de pago, índice fondeado on-chain) + 1` **no es suficiente por sí sola**, porque la cadena no puede probar que un índice **no fondeado** fue asignado históricamente.

| Decisión | Por qué existe |
|---|---|
| **D1 — Durable Allocation Record** | Evidencia durable, monotónica, por wallet version, del índice más alto asignado; sobrevive a un rollback de la DB. |
| **D2 — Allocation Ledger + Durable HWM** | El Ledger da trazabilidad/auditoría; el HWM (persistencia independiente) impide reutilizar índices asignados-pero-no-fondeados. Visibilidad diferida hasta confirmar el HWM. |
| **D3 — Safety Range Burning** | Defensa en profundidad configurable; no reemplaza al HWM ni convierte incertidumbre en certeza. |
| **D4 — Fail-Closed Recovery Policy** | Sin `safe_next_index` probado se bloquea la asignación; se sacrifica disponibilidad antes que seguridad. |
| **D5 — Reconciliation per Wallet Version** | El dominio de reconciliación es la wallet version; solo ACTIVE asigna, las retiradas se monitorean. |
| **D6 — Recovery State Machine** | `READY / RECOVERY_REQUIRED / RECONCILING / RECOVERY_FAILED`; idempotente; nunca transiciona a READY tras interrupción. |
| **D7 — Descriptor Monitoring / Lookahead** | `monitored_range_end ≥ safe_next_index + configurable_lookahead`; no se alcanza READY sin monitoring validado. |
| **D8 — Recovery Package** | Evidencia condicional/auxiliar; nunca mueve HWM ni `safe_next_index` hacia atrás; si no reconstruye estado autoritativo, fail-closed. |
| **D9 — Backup Strategy** | Clasificación por propósito (Fund Safety / Address Allocation Safety / Service Recovery / Reconstructable); HWM con ciclo de recuperación independiente. |
| **D10 — Implementation Order** | Garantías de never-reuse, reconciliación y fail-closed **antes** de habilitar la derivación non-custodial en producción. |

---

## ARCH-006 — Late Payments & Reconciliation

> **Estado del diseño: Aprobado** (D1–D12). **Implementación: pendiente.** Documento dedicado: [ARCH-006-late-payments-reconciliation.md](./ARCH-006-late-payments-reconciliation.md).

Principio: FloweyPay **registra objetivamente lo que ocurrió en Bitcoin**, **preserva lo que ocurrió con el invoice** y **deja la interpretación comercial al comercio**. Non-custodial: no rechaza, revierte, reembolsa ni mueve un pago on-chain.

| Decisión | Por qué existe |
|---|---|
| **D1 — Separar Invoice y Payment lifecycles** | Un Late Payment no se modela como `EXPIRED → PAID`; mutarlo destruiría el historial (expiración real, rate lock vencido, ausencia de decisión comercial). |
| **D2 — Payment arrival time** | `ON_TIME` vs `LATE` por el **first-seen** más temprano confiable vs `expires_at`; nunca por block timestamp/confirmación/recovery. |
| **D3 — Indeterminate timing** | first-seen no confiable (offline/recovery/rescan) ⇒ `INDETERMINATE` → revisión; recovery observation-neutral. |
| **D4 — Exact late payment** | Invoice permanece `EXPIRED`; se registra `timing=LATE, amount=EXACT, reconciliation=REVIEW_REQUIRED`. |
| **D5 — No automatic commercial acceptance** | `EXACT` no implica `ACCEPTED`; el comercio concilia. |
| **D6 — Multiple transactions per invoice** | N txs por invoice; acumular recibido; preservar el conjunto de txs. |
| **D7 — Monitoring horizon** | Detectabilidad = tiempo de monitoring de la wallet version (ARCH-005); ACTIVE y RETIRED monitoreadas; sin decommission por tiempo en MVP. |
| **D8 — Expired link not payable** | Link expirado sin QR/acción de pago; dirección read-only; no incentivar pagos tardíos. |
| **D9 — Refunds in MVP** | Sin reembolsos on-chain; a lo sumo registro (record-only) de un reembolso externo. |
| **D10 — Late Payment notifications** | Idempotentes y mínimas: `LATE_PAYMENT_DETECTED`, `LATE_PAYMENT_CONFIRMED`; sin spam por tx. |
| **D11 — Reorg vs reconciliation** | Revertir estado on-chain sin borrar la decisión comercial histórica; devolver a revisión. |
| **D12 — Wallet version attribution** | Cada Late Payment atribuible a invoice original + dirección derivada + wallet version; rotación no cambia timing/amount. |

---

## DB-001 — Merchant Wallet + Wallet Versions

> **Estado del diseño: Aprobado** (D1–D16). **Implementación: pendiente** (DB-006). Documento dedicado: [DB-001-merchant-wallet-wallet-versions.md](./DB-001-merchant-wallet-wallet-versions.md).

Materializa la persistencia que ARCH-001/002/003/005 presuponen. **No** rediseña ninguna decisión ARCH. Dos entidades: **`MerchantWallet`** (identidad lógica / linaje de rotación) → **`MerchantWalletVersion`** (identidad de derivación pública inmutable + ciclo de vida).

| Decisión | Por qué existe |
|---|---|
| **D1 — Table topology** | Separar identidad lógica estable (`MerchantWallet`) de las versiones inmutables (`MerchantWalletVersion`); da hogar al linaje de rotación y al Recovery Package. |
| **D2 — MVP wallet cardinality** | Exactamente una wallet por merchant (`UNIQUE(merchant_id)`); multi-wallet fuera de MVP, relajable después. |
| **D3 — Active version invariant** | A lo sumo una versión `ACTIVE` por wallet; índice parcial único (`WHERE lifecycle = 'ACTIVE'`); la app sola no basta. |
| **D4 — Canonical wallet material** | Output Descriptor BIP84 incl. checksum como fuente de verdad; `descriptor_checksum` derivado y **no** único. |
| **D5 — Master fingerprint** | Persistido independientemente (8 hex/4 bytes), validado contra la key-origin; inmutable tras activación. |
| **D6 — Derivation path** | Denormalización validada; el Descriptor es la fuente de verdad; metadata mutuamente consistente. |
| **D7 — Network** | Explícito (`MAINNET/TESTNET/SIGNET/REGTEST`), validado contra el coin type; previene errores cross-network. |
| **D8 — Script type** | Explícito, **P2WPKH** en MVP; sin Taproot/Multisig/Lightning. |
| **D9 — Wallet version identity** | `id` UUID + `version` secuencial (`> 0`, único por wallet); rotación crea `N+1`; nunca se sobrescribe. |
| **D10 — Lifecycle** | Solo `ACTIVE`/`RETIRED`; sin `PENDING_VERIFICATION`/`DISABLED`/`ARCHIVED`; one-way; `RETIRED` permanece atribuible/monitorizable. |
| **D11 — Recovery state** | Diferido a DB-003; DB-001 provee `MerchantWalletVersion.id` como ancla. |
| **D12 — Index / cursor / HWM** | DB-001 no persiste `next_index`/cursor/`highest_ever_allocated_index`/Durable HWM; pertenecen a DB-002/INFRA-001. |
| **D13 — Descriptor uniqueness** | `UNIQUE(descriptor)` global; **no** `UNIQUE(descriptor_checksum)`. |
| **D14 — Legacy payment attribution** | Sin wallet version sintética sin Descriptor; DB-002 permitirá `wallet_version_id = NULL`; DB-001 no modifica `Payment`. |
| **D15 — Deletion policy** | Versiones usadas nunca se borran; `RETIRED` reemplaza al borrado; `MerchantWallet` permanece con historial. |
| **D16 — Descriptor security** | MVP: cifrado en reposo/backups, privilegio mínimo, sin loguear/telemetrizar/exponer el Descriptor completo; cifrado de columna diferido. |

---

## DB-002 — Allocation Ledger

> **Estado del diseño: Aprobado** (D1–D17). **Implementación: pendiente** (DB-006; Durable HWM en INFRA-001). Documento dedicado: [DB-002-allocation-ledger.md](./DB-002-allocation-ledger.md).

Materializa el **Allocation Ledger** y la relación `invoice ↔ wallet_version ↔ derivation_index` que ARCH-002/005/006 y DB-001 presuponen. **No** rediseña ninguna decisión ARCH ni DB-001. Entidad conceptual: **`WalletAddressAllocation`** (consumo irrevocable de índice + dirección derivada + atribución al invoice). Principio central: un índice durablemente consumido **nunca** se reutiliza — **SAFETY > INDEX DENSITY**.

| Decisión | Por qué existe |
|---|---|
| **D1 — Allocation semantics** | Consumo **irrevocable** de índice por wallet version; en el path exitoso la atribución al `Payment` se escribe **atómicamente** con la Allocation; consumido por el HWM, el índice nunca se reutiliza aunque la transacción PG falle. |
| **D2 — Entity name** | `WalletAddressAllocation` = wallet version + índice + dirección derivada + atribución; **no** es un registro de transacción Bitcoin; una dirección recibe 0..N transacciones. |
| **D3 — Allocation sin Payment** | El path normal nunca deja una Allocation committeada sin `Payment`; la reconciliación **puede** materializar un **BURN record** permanente (`payment_id = NULL` + `burn_reason`). |
| **D4 — Terminal outcome model** | Sin máquina de reserva; fila terminal **`ATTRIBUTED`** (`payment_id NOT NULL`, `burn_reason NULL`) **XOR** **`BURNED`** (`payment_id NULL`, `burn_reason NOT NULL`); `CHECK` XOR. |
| **D5 — Derivation index type/range** | `derivation_index` BigInt conceptual; `0 <= i < 2^31` (receive chain BIP84); tipo físico final en DB-006. |
| **D6 — Never-reuse constraint** | `UNIQUE(wallet_version_id, derivation_index)`; el mismo índice es válido en versiones distintas (namespaces independientes). |
| **D7 — BTC address persistence** | Persistir `btc_address` derivada de `descriptor` + índice; **autoritativa** para non-custodial; re-derivable para verificación/recovery. |
| **D8 — BTC address uniqueness** | `UNIQUE(btc_address)`; validación de compatibilidad con network/Descriptor de la wallet version. |
| **D9 — `Payment.btc_address` transition** | Retener para legacy/compatibilidad/migración; non-custodial → `Allocation.btc_address` autoritativa; a lo sumo copia denormalizada, **no** segunda fuente de verdad; **no** se elimina en DB-002. |
| **D10 — Durable HWM ordering** | El **Durable HWM** provee consumo **atómico monotónico** por wallet version (fetch-and-increment/CAS); avanza **antes** del commit PG y de la visibilidad de la dirección; fallo seguro = índice quemado/saltado; la tecnología es de INFRA-001. |
| **D11 — Candidate index / HWM dominance** | **No** `MAX(ledger.index)+1`; `ledger_max(V)` es solo observabilidad (−1 si vacío); `HWM(V)` autoritativo; `candidate = previous_HWM+1` (normal) o `safe_next_index` (recovery); `candidate` nunca `<= HWM`; `HWM(V) >= ledger_max(V)`; ledger por delante del HWM ⇒ **fail-closed**; PG **no** es prueba autoritativa del HWM. |
| **D12 — Concurrency** | Unicidad concurrente desde el consumo atómico del HWM; `UNIQUE(V,index)` como defensa en profundidad (violación = bug, nunca reuso); advisory lock opcional para contención. |
| **D13 — Deletion policy** | Append-only; nunca se borra por expiración/cancelación/fallo/link expirado/sin BTC/`RETIRED`; el ciclo de vida del invoice nunca libera un índice; un BURN es permanente. |
| **D14 — Legacy discriminator** | `Payment.receiving_model` inmutable (`SHARED_CUSTODIAL` / `NON_CUSTODIAL_DERIVED`); legacy = `SHARED_CUSTODIAL` + sin Allocation (válido); `NON_CUSTODIAL_DERIVED` + Allocation faltante = inválido; sin wallet versions sintéticas (preserva DB-001 D14); semántica DB-002, columna física DB-006. |
| **D15 — Ledger vs event log** | Allocation Ledger = una fila terminal/inmutable por índice consumido; **no** event-sourced; la reconciliación puede añadir una fila BURN permanente. |
| **D16 — Immutability enforcement** | Identidad inmutable (`wallet_version_id`, `derivation_index`, `btc_address`, `network`); `payment_id`/`burn_reason` inmutables tras el INSERT; `BURNED` nunca se vuelve `ATTRIBUTED`; un `Payment` nunca se mueve entre Allocations; enforcement DB-level en DB-006. |
| **D17 — Privacy / security** | Direcciones públicas pero privacy-sensitive: privilegio mínimo, backups cifrados, evitar logging/telemetría, restringir exposición masiva, redacción de diagnósticos; sin cifrado de columna requerido; **no** persistir `hwm_confirmed_at`. |

---

## DB-003 — Recovery State + Descriptor Monitoring

> **Estado del diseño: Aprobado** (D1–D17). **Implementación: pendiente** (DB-006; Durable HWM en INFRA-001; motor de reconciliación/establecimiento y llamadas de Bitcoin Core en Worker/runtime). Documento dedicado: [DB-003-recovery-state-descriptor-monitoring.md](./DB-003-recovery-state-descriptor-monitoring.md).

Materializa la persistencia operativa que ARCH-005/006 y DB-001/002 presuponen: **si** la asignación es segura y **qué** cobertura de Descriptor monitoring ha sido verificada, por wallet version. Dos entidades separadas y **1:1**: **`MerchantWalletRecoveryState`** (allocation-safety gate) y **`MerchantWalletDescriptorMonitoring`** (monitoring-coverage claim). **No** rediseña ninguna decisión ARCH ni DB-001/002.

| Decisión | Por qué existe |
|---|---|
| **D1 — Dedicated operational entities** | La persistencia de recovery/monitoring **no** se coloca sobre `MerchantWalletVersion` (identidad de derivación inmutable); usa entidades operativas dedicadas. |
| **D2 — Two-entity separation** | `MerchantWalletRecoveryState` (gate, baja frecuencia) y `MerchantWalletDescriptorMonitoring` (claim, más frecuente) **separadas**; la observabilidad de monitoring nunca se convierte silenciosamente en autoridad de asignación. |
| **D3 — Cardinality** | Cada wallet version tiene **una** Recovery State y **una** Monitoring; ACTIVE y RETIRED; `wallet_version_id` como ancla 1:1 (PK/FK). |
| **D4 — Recovery State machine** | **Exactamente** cuatro estados: `RECOVERY_REQUIRED`, `RECONCILING`, `READY`, `RECOVERY_FAILED` (los mismos identificadores de ARCH-005 D6); sin `PENDING`/`DISABLED`/`ARCHIVED`/`INITIALIZING`/`RECOVERING`. |
| **D5 — Unified initial establishment / reconciliation** | Versión nueva inicia fail-closed (`RECOVERY_REQUIRED` + `INITIAL_ESTABLISHMENT`), no "recovering"; `READY` **solo** tras probar HWM baseline + `safe_next_index` + identidad de Descriptor (DB-001) + monitoring live-verificado; sin estado nuevo de onboarding. |
| **D6 — Allocation gate** | Asignar solo si `lifecycle == ACTIVE AND recovery_state == READY`; consumido por DB-002; ambigüedad ⇒ fail-closed; RETIRED nunca asigna. |
| **D7 — Monitoring boundaries** | ACTIVE `monitored_through_index >= safe_next_index + lookahead`; RETIRED `monitored_through_index >= HWM(V)` (derivado del Durable HWM; **sin** forward lookahead; **nunca** de `safe_next_index` ni de `MAX(ledger)`; **no** se escribe `HWM = safe_next_index - 1`). DB-003 no persiste HWM. |
| **D8 — Minimal inline transition metadata** | `state_reason` + `state_changed_at` inline; **sin** tabla de historial/evento en P0. |
| **D9 — Crash-safe reconciliation without run ID** | Seguridad vía `recovery_state` + `lock_version` + advisory lock por wallet version; `READY` solo tras prueba completa; `RECONCILING` interrumpido → `RECOVERY_REQUIRED` (`RECONCILE_INTERRUPTED`), nunca auto→`READY`; sin `reconciliation_run_id` P0; `reconciliation_started_at` opcional. |
| **D10 — Monitoring metadata is observability** | Monitoring-coverage claim; `VERIFIED` no prueba por sí solo la cobertura del runtime; live-verificar donde la seguridad dependa de la cobertura. |
| **D11 — Advance claim only after live verification** | `monitored_through_index` avanza **solo** tras verificar el motor de runtime; nunca inferir cobertura desde PostgreSQL; recreación/reemplazo de nodo invalida la reclamación → `STALE`/re-establecer. |
| **D12 — Lookahead is configuration** | `lookahead` es configuración/política; **no** persistir `lookahead_size`; boundary ACTIVE recomputado desde `safe_next_index + lookahead`. |
| **D13 — ACTIVE lookahead invariant** | Antes de asignación ACTIVE segura, el monitoring live debe satisfacer `monitored_through_index >= safe_next_index + lookahead`; una reclamación `VERIFIED` persistida por sí sola es insuficiente para `READY`. |
| **D14 — No HWM mirror** | **No** persistir `HWM`, `safe_next_index`, `ledger_max`, `candidate_index`, `hwm_confirmed_at` ni equivalente; leídos/derivados de sus fuentes autoritativas en reconciliación. |
| **D15 — Crash-safe monitoring extension without persisted target** | **No** persistir `import_target_through_index`; extensión idempotentemente re-ejecutable (recomputar ceiling + re-establecer + verificar + avanzar reclamación); distinguir el mecanismo de Bitcoin Core del requisito de arquitectura. |
| **D16 — Concurrency** | `lock_version` optimista + advisory lock por wallet version para serializar establecimiento/reconciliación y monitoring; **no** sustituye el consumo atómico del Durable HWM. |
| **D17 — Security / privacy** | Sin Seed/Private Keys; `state_reason` = código estructurado cerrado (vocabulario P0), extensible solo por cambio de esquema; `last_error` redactado; sin volcados RPC/excepción/descriptors/credenciales/rutas/secretos. |

---

## INFRA-001 — Durable HWM

> **Estado del diseño: Aprobado** (D1–D24, con refinamientos **FINAL** en D2/D4/D7/D10/D11). **Implementación: pendiente** (provisión de la instancia PostgreSQL dedicada, `DurableHwmStore`, tablas, roles, PITR/backups independientes, runbook, tests). **Área:** Infra / Security. **Prioridad:** P0. Documento dedicado: [INFRA-001-durable-hwm.md](./INFRA-001-durable-hwm.md).

Materializa la **infraestructura de durabilidad** del **Durable HWM** que ARCH-005 D2 y DB-002 D10/D11 presuponen: una **marca de agua autoritativa de consumo** de índices de derivación por wallet version, con **ciclo de vida independiente del PostgreSQL operativo**. **No** rediseña ninguna decisión ARCH ni DB; **no** persiste el Allocation Ledger, la Recovery State ni el Descriptor monitoring.

| Decisión | Por qué existe |
|---|---|
| **D1 — Tecnología** | **Instancia PostgreSQL dedicada** como primario P0 (transaccional, CAS, durabilidad probada); KV transaccional gestionado como segunda opción/futuro; **Redis no** como autoridad. |
| **D2 — Dominio de fallo independiente (FINAL)** | Instancia PostgreSQL **dedicada** con **data directory, volumen, timeline WAL/PITR, backups y credenciales** propios; una **segunda base de datos en la instancia operativa es explícitamente insuficiente**; host/región separados = post-MVP hardening; residual de mismo host mitigado con volúmenes/restore/deletion-protection/never-backward/fail-closed. |
| **D3 — Namespace por wallet version** | `HWM(V)` independiente por `wallet_version_id`; nunca compartido entre versiones. |
| **D4 — `generation` (FINAL)** | CAS/optimistic concurrency + guard monotónico-forward de `establishBaseline` + metadata de cross-check; **NO** detecta el rollback del propio store del HWM. |
| **D5 — Valor inicial** | `HWM = -1` inicial; `establishBaseline` **explícito**; primer `consumeNext` devuelve `0`; dominio `-1 <= HWM < 2^31`. |
| **D6 — Consumo atómico** | `consumeNext(walletVersionId, operationId)` devuelve `previous_HWM + 1` e incrementa el HWM **atómicamente**; monotónico never-reuse. |
| **D7 — Idempotencia (FINAL)** | `operationId` **obligatorio**; **`UNIQUE(wallet_version_id, operation_id)`**; incremento + INSERT de operación en la **misma transacción**; duplicados concurrentes convergen a **un** índice vía rollback + retry-on-unique-violation; el `SELECT` inicial es solo fast path; READ COMMITTED + row lock + reintento acotado; **sin** lock distribuido. |
| **D8 — Timeout ambiguo** | Reintento con el mismo `operationId` ⇒ mismo índice; irrecuperable ⇒ `RECOVERY_REQUIRED` + índice quemado (Safety Range Burning). |
| **D9 — Autoridad única** | El Durable HWM es la **única** autoridad de never-reuse; `MAX(ledger)+1`, `safe_next_index` on-chain o el estado de Bitcoin Core **no** son autoridad de asignación. |
| **D10 — Durabilidad (FINAL)** | P0 = `synchronous_commit=on` + almacenamiento durable + PITR/backups independientes + deletion protection + never-backward restore + fail-closed; **standby síncrono = post-MVP hardening**, **no** requerido para la corrección de never-reuse. |
| **D11 — Detección de rollback (FINAL)** | Por **reconciliación contra evidencia aprobada** (Allocation Ledger / on-chain / Recovery Package), preservando `HWM(V) >= ledger_max(V)`; **no** por `generation`; **sin** segunda autoridad oculta. |
| **D12 — Ordenamiento con PG operativo** | El HWM se incrementa **antes** de derivar/persistir la Allocation; una Allocation nunca precede a su avance de HWM. |
| **D13 — Restore Caso A** | Restaurar el PostgreSQL **operativo** es rutinario/seguro: el HWM **no** se mueve hacia atrás; `ledger_max` puede quedar rezagada sin comprometer never-reuse. |
| **D14 — Restore Caso B** | Restaurar el **HWM PostgreSQL** es excepcional/**fail-closed**: baseline **solo forward**, con evidencia; Safety Range Burning quema índices inciertos. |
| **D15 — Pérdida total del HWM** | Reconstrucción conservadora desde evidencia aprobada (`HWM >= ledger_max` + margen); nunca hacia atrás; fail-closed hasta re-establecer. |
| **D16 — Corrupción de registro** | Corrupción/ambigüedad detectada ⇒ fail-closed + `RECOVERY_REQUIRED`; nunca continuar con un HWM sospechoso. |
| **D17 — Seguridad / roles** | Tres roles (consume / reconciliation / recovery-admin), privilegio mínimo, conectividad privada, TLS, cifrado en reposo, audit, deletion protection, alarmas. |
| **D18 — Aislamiento de entornos** | Un HWM PostgreSQL por entorno (dev/staging/prod); nunca compartido entre entornos. |
| **D19 — Propiedad de componentes** | Abstracción estrecha `DurableHwmStore` (librería, **no** microservicio); solo el path de creación de pagos avanza el HWM; el Worker es **solo lectura**. |
| **D20 — Desarrollo local** | Instancia PostgreSQL dedicada también en local (contenedor separado); nunca reutilizar la operativa como HWM. |
| **D21 — Observabilidad** | Métricas/alarmas sin exponer valores crudos del HWM; latencia de consume, tasa de retry, disponibilidad, lag de reconciliación. |
| **D22 — Costo operativo** | No hay nueva tecnología de DB, pero sí una **superficie operativa dedicada no despreciable** (no "zero new ops"). |
| **D23 — Límites de alcance** | Fuera: Allocation Ledger + `derivation_index` (DB-002), Recovery State + monitoring (DB-003), identidad/Descriptor (DB-001), esquema Prisma + migraciones (DB-006), provisión real y motor de reconciliación en runtime. |
| **D24 — Contrato de tests** | 17 tests de contrato del `DurableHwmStore` (baseline, monotonicidad, idempotencia por `operationId`, unicidad, concurrencia, fail-closed, never-backward), definidos como contrato; implementación pendiente. |

---

## DB-004 — Late Payment + Merchant Reconciliation

> **Estado del diseño: Aprobado** (D1–D16, con refinamiento **FINAL** en D7). **Implementación: pendiente** (esquema Prisma + enums + constraints + `UNIQUE(txid, vout_index)` físico + migraciones en DB-006; first-seen confiable, manejo de reorg, dejar de descartar tx a invoices `EXPIRED`, migración del matching, motor de clasificación y dispatch en Worker/runtime). **Prioridad:** P0. Documento dedicado: [DB-004-late-payment-merchant-reconciliation.md](./DB-004-late-payment-merchant-reconciliation.md).

Materializa la persistencia que **ARCH-006** presupone: clasificar cada `Payment` por **timing** (`ON_TIME | LATE | INDETERMINATE`) y **amount** (`UNDERPAID | EXACT | OVERPAID`) como dimensiones **ortogonales**, persistir la **conciliación auditable del comercio** y persistir la **evidencia de observación on-chain** (first-seen confiable + provenance + estado de reorg). **No** rediseña ninguna decisión ARCH ni DB-001/002/003 ni INFRA-001.

| Decisión | Por qué existe |
|---|---|
| **D1 — Bitcoin observation granularity** | Una observación persistida representa un **outpoint** `(txid, vout_index)`; un `Payment` puede tener N outpoints; se **extiende** el `payment_btc_txs` existente, no una entidad paralela. |
| **D2 — Optional lazy PaymentReconciliation** | `PaymentReconciliation` opcional **1:1**, creada **lazily** solo para `LATE`/`INDETERMINATE`; la **ausencia** significa **solo** "nunca entró al workflow", sin estado implícito (aceptado/rechazado/conciliado/oculto/"no requerido"). |
| **D3 — Persist timing classification** | Timing explícito `ON_TIME | LATE | INDETERMINATE`; `INDETERMINATE` es un resultado conservador **válido**, no un fallo técnico. |
| **D4 — Amount classification orthogonal** | Amount independiente del timing: `UNDERPAID | EXACT | OVERPAID`; para múltiples outpoints usa el **agregado atribuido**; sin sobrecargar timing con amount. |
| **D5 — Immutable Payment lifecycle history** | La conciliación es una dimensión separada; un invoice `EXPIRED` **permanece** `EXPIRED` (ARCH-006) aunque llegue BTC después. |
| **D6 — Reliable first-seen + provenance** | Persistir first-seen confiable + provenance + metadata para clasificación auditable/reproducible; el `detected_at` del Worker **no** es first-seen autoritativo automático; proveedor de runtime diferido, sin acople; físico en DB-006. |
| **D7 — FINAL reconciliation state machine** | `REVIEW_REQUIRED → { ACCEPTED, REJECTED }`; "sin acción" = `REVIEW_REQUIRED` (nunca `REJECTED`); **sin** `DISMISSED`; **sin** `REFUNDED_EXTERNALLY` como estado; reapertura a `REVIEW_REQUIRED` solo por evidencia/reorg, preservando el historial. |
| **D8 — Append-only audit history** | Decisiones/acciones en historial **append-only** (acción, actor, timestamp, razón/contexto, reaperturas por evidencia); el estado actual es una proyección; el historial no se sobrescribe. |
| **D9 — Global outpoint uniqueness** | Invariante target **`UNIQUE(txid, vout_index)` global**, no debilitada a por-`Payment`; DB-006 posee inspección legacy + migración segura + remediación + creación física; no existe aún. |
| **D10 — Idempotent processing** | Ingesta/clasificación/actualización de la proyección idempotentes/recomputables; observar el mismo outpoint repetidamente no crea atribución económica duplicada. |
| **D11 — Reorg orthogonal to merchant history** | Un reorg puede cambiar la proyección on-chain objetiva (`observation_status`, confirmaciones, bloque) pero **no** borra el historial append-only; `REORG_REVERTED` no es estado Bitcoin terminal permanente. |
| **D12 — Multiple outpoints aggregate** | Múltiples outputs agregados para el amount pero **preservados individualmente**; sin colapsar en una tx sintética. |
| **D13 — Wallet rotation preserves attribution** | La atribución histórica permanece válida cuando la `MerchantWalletVersion` pasa a `RETIRED` (vía DB-002); `RETIRED` bloquea nuevas asignaciones (DB-001) pero no invalida late payments/conciliación históricos. |
| **D14 — No allocation authority** | DB-004 **no** es autoridad de asignación de `derivation_index`, `WalletAddressAllocation`, Durable HWM, `safe_next_index`, Recovery State ni Descriptor monitoring. |
| **D15 — Legacy boundary** | Legacy `SHARED_CUSTODIAL` **solo** usa evidencia que existe; **sin** `MerchantWalletVersion`/`WalletAddressAllocation`/`derivation_index`/descriptor sintéticos; atribución legacy sobre `payments.btc_address` histórica donde la arquitectura upstream lo requiera. |
| **D16 — Non-custodial / financial scope** | Persiste evidencia, clasificación, conciliación y auditoría; **no** introduce private keys, custodia, reembolsos automáticos, exchange, conversión fiat, settlement, contabilidad ni ledger financiero general. |

---

**Siguiente:** [15 — Roadmap futuro](./15-future-roadmap.md)
