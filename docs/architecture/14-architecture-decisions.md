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

**Siguiente:** [15 — Roadmap futuro](./15-future-roadmap.md)
