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

**Siguiente:** [15 — Roadmap futuro](./15-future-roadmap.md)
