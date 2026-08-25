# 16 — Glosario

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [15 — Roadmap futuro](./15-future-roadmap.md).

Terminología de Bitcoin e ingeniería usada en esta documentación. Los términos de estándar internacional se mantienen en inglés.

---

- **Address derivation (derivación de direcciones)** — cálculo de una dirección de recepción a partir de una clave pública en un path como `m/84'/coin'/account'/0/index`.
- **BIP84** — estándar para wallets HD Native SegWit (P2WPKH); define el path `m/84'/...`.
- **Output Descriptor** — cadena precisa y auto-descriptiva (con checksum) que define el espacio de direcciones de una wallet, p. ej. `wpkh([fp/84h/0h/0h]xpub.../0/*)#cs`. Es la fuente de verdad interna de FloweyPay.
- **Fingerprint (Master Fingerprint)** — identificador de 4 bytes de la clave maestra de la wallet; vincula un Descriptor a una Seed/dispositivo específico.
- **Gap Limit** — cuántas direcciones consecutivas sin uso escanea una wallet antes de asumir que no hay más fondos (por defecto 20). Gaps grandes de invoices pueden excederlo y ocultar fondos hasta una importación con rango explícito.
- **P2WPKH** — Pay-to-Witness-Public-Key-Hash; el script type Native SegWit de clave única usado en el MVP.
- **Recovery Package** — exportación firmada y Watch-only (Descriptor, checksum, Fingerprint, path, network, último índice asignado/fondeado, rango de importación recomendado, historial de rotación, firma) que habilita la recuperación independiente de FloweyPay.
- **Wallet Rotation** — cambio del comercio a un nuevo Descriptor mientras se continúa monitoreando el viejo por pagos tardíos.
- **Watch-only** — capacidad de ver direcciones/saldos sin capacidad de gastar; FloweyPay es estrictamente Watch-only.
- **XPUB** — clave pública extendida; puede derivar todas las claves/direcciones públicas hijas de una cuenta (no puede gastar).
- **ZPUB** — variante SLIP-132 de XPUB que señala Native SegWit (BIP84); codifica solo la pista de script type, no el Fingerprint/path.
- **Native SegWit** — formato de dirección SegWit v0 (bech32, prefijo `bc1q`), correspondiente a P2WPKH en el MVP.
- **Worker** — servicio de FloweyPay que observa mempool y bloques (vía ZMQ de Bitcoin Core) y dirige las transiciones de estado del pago.
- **Payment Link** — enlace público que crea el comercio para cobrar; al abrirse inicia un invoice.
- **Bitcoin Core** — implementación de nodo Bitcoin usada como autoridad de validación de descriptors, derivación de direcciones y feeds ZMQ.
- **Descriptor monitoring** — observación por Bitcoin Core de rangos explícitos de un Descriptor, adelantada a la asignación de índices.
- **Rate lock** — fijación de la tasa fiat→sats al crear el invoice, con una expiración asociada.
- **Coin type** — componente del path de derivación: `0'` para mainnet, `1'` para signet/testnet/regtest.
- **Allocation Ledger** — registro en la base de datos operativa del historial de asignaciones de índices de derivación; aporta trazabilidad y auditoría (ARCH-005).
- **Durable High-Water Mark (HWM)** — evidencia durable y **monotónica** del `highest_ever_allocated_index` por wallet version, con un ciclo de persistencia **independiente** del rollback ordinario de la DB. Nunca decrece; protege contra la reutilización de índices asignados-pero-no-fondeados (ARCH-005).
- **safe_next_index** — el siguiente índice de derivación que puede probarse como seguro para asignar sin reutilizar uno ya asignado. Si no puede probarse, aplica fail-closed (ARCH-005).
- **Fail-closed** — política que bloquea la asignación de nuevas direcciones cuando no puede probarse la seguridad de asignación; sacrifica disponibilidad antes que seguridad (ARCH-005 D4).
- **Wallet version** — dominio de reconciliación de FloweyPay: cada versión de wallet mantiene independientemente su Descriptor, cursor, Allocation Ledger, Durable HWM, rango monitoreado y estado de recuperación (ARCH-005 D5).
- **Recovery State Machine** — máquina de estados de seguridad de recuperación por wallet version: `READY / RECOVERY_REQUIRED / RECONCILING / RECOVERY_FAILED`; idempotente y fail-closed (ARCH-005 D6).
- **Safety Range Burning** — quema opcional y **configurable** de un rango adicional de índices tras una recuperación; defensa en profundidad que no reemplaza al HWM (ARCH-005 D3).
- **Lookahead** — margen configurable por el cual el rango monitoreado debe exceder el cursor de asignación: `monitored_range_end ≥ safe_next_index + lookahead` (ARCH-005 D7).
- **Index reconciliation** — proceso de probar el `safe_next_index` por wallet version tras una restauración o inconsistencia, apoyándose en el Durable HWM y no solo en el estado on-chain (ARCH-005).
- **Late Payment (pago tardío)** — transacción Bitcoin válida que acredita la dirección de un invoice cuyo tiempo de llegada de negocio cae **después** de `expires_at` (ARCH-006).
- **Payment reconciliation (conciliación de pago)** — representación de qué ocurrió con los BTC recibidos contra un invoice (timing, amount, respuesta comercial del comercio). Distinta de la **index reconciliation** de ARCH-005 (ARCH-006).
- **first-seen** — evidencia más temprana y confiable, desde el nodo de FloweyPay, de que la red vio una transacción; es el reloj de negocio para clasificar `ON_TIME` vs `LATE` (ARCH-006 D2).
- **Timing classification** — clasificación ortogonal del momento de llegada de un pago: `ON_TIME | LATE | INDETERMINATE` (ARCH-006 D2/D3).
- **Amount classification** — clasificación ortogonal del monto recibido vs esperado: `UNDERPAID | EXACT | OVERPAID`; el `expected_amount` es inmutable (ARCH-006).
- **INDETERMINATE (timing)** — estado de timing cuando el first-seen no es confiable (offline/recovery/rescan); requiere revisión del comercio y nunca se marca automáticamente como `LATE`/`ON_TIME` (ARCH-006 D3).
- **Merchant reconciliation actions** — acciones auditables del comercio sobre un Late Payment: `ACCEPT / DISMISS / ADD NOTE / RECORD EXTERNAL REFUND`. `EXACT` no implica `ACCEPTED` (ARCH-006 D5/D9).

---

Volver al [índice de documentación](./README.md).
