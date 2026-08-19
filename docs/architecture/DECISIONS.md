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

## Roadmap futuro

- **ARCH-005 (diseño aprobado; implementación pendiente):** reconciliación de índices y Backup Recovery (Durable HWM, Allocation Ledger, fail-closed, Recovery State Machine).
- **ARCH-006 (Planificado):** política de Late Payment; Taproot, Multisig, Lightning, comercios multi-wallet.
- Ver [15-future-roadmap.md](./15-future-roadmap.md).

---

> **Observación.** El código actual asigna direcciones desde una wallet compartida de Bitcoin Core (custodial hoy). El modelo non-custodial por Descriptor descrito aquí es el objetivo aprobado. Ver observaciones consolidadas en [12-operational-flow.md](./12-operational-flow.md).
