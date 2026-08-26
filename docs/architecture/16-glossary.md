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
- **MerchantWallet** — entidad de persistencia (DB-001) que representa la **identidad lógica estable** de la wallet de un comercio y el **linaje de Wallet Rotation**; sobrevive a las rotaciones. MVP: una por merchant.
- **MerchantWalletVersion** — entidad de persistencia (DB-001) que representa la **identidad de derivación pública inmutable** de una versión de wallet (Descriptor, checksum, Fingerprint, Derivation Path, network, script type) más su ciclo de vida `ACTIVE`/`RETIRED`. Es el ancla `wallet_version_id` que referencian DB-002/003/004 e INFRA-001.
- **Wallet lifecycle (ACTIVE / RETIRED)** — ciclo de vida por versión de wallet en DB-001: `ACTIVE → RETIRED` es unidireccional; las versiones `RETIRED` nunca se borran y permanecen atribuibles/monitorizables (DB-001 D10/D15).
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
- **Allocation Ledger** — registro en la base de datos operativa del historial de asignaciones de índices de derivación; aporta trazabilidad y auditoría (ARCH-005). En DB-002 se materializa como **una fila terminal e inmutable por índice consumido** (`ATTRIBUTED` o `BURNED`), **no** como un event log; **no** es la autoridad de recuperación (esa es el Durable HWM).
- **WalletAddressAllocation** — entidad conceptual de persistencia (DB-002) que representa el **consumo irrevocable** de un `derivation_index` para una `MerchantWalletVersion`, junto con la **dirección derivada** y la **atribución al invoice**. **No** es un registro de transacción Bitcoin; una Allocation/dirección puede recibir 0..N transacciones. Identidad inmutable; `UNIQUE(wallet_version_id, derivation_index)` y `UNIQUE(btc_address)`.
- **receiving_model** — discriminador **inmutable** de `Payment` (DB-002 D14): `SHARED_CUSTODIAL` (pago legacy/actual desde la wallet compartida de Bitcoin Core, sin Allocation) o `NON_CUSTODIAL_DERIVED` (pago derivado por wallet version, con exactamente una `WalletAddressAllocation`). Evita depender de una fecha de cutover para distinguir legacy de corrupción.
- **ATTRIBUTED / BURNED** — las dos formas terminales de una fila del Allocation Ledger (DB-002 D4): **ATTRIBUTED** (`payment_id NOT NULL`, `burn_reason NULL`; escrita atómicamente con el `Payment`) **XOR** **BURNED** (`payment_id NULL`, `burn_reason NOT NULL`; un índice consumido por el Durable HWM sin atribución sobreviviente, materializado **solo** por reconciliación). Una fila `BURNED` nunca puede volverse `ATTRIBUTED`.
- **ledger_max** — `MAX(derivation_index)` de las Allocations de una wallet version, o `-1` si no hay filas (DB-002 D11). Es **solo observabilidad/reconciliación**; puede quedar rezagada tras un restore de PostgreSQL y **no** es autoridad de asignación (`candidate_index` nunca se selecciona desde `ledger_max + 1`).
- **candidate_index** — índice devuelto/aprobado por el mecanismo de asignación seguro (DB-002 D11): en operación normal el consumo atómico del Durable HWM devuelve `previous_HWM + 1`; en recovery proviene de `safe_next_index` (ARCH-005). Nunca `<= HWM`; nunca proviene de `MAX(ledger)+1`.
- **burn_reason** — motivo persistido de la quema de un índice en una fila `BURNED` del Allocation Ledger (DB-002 D4/D16); presente **únicamente** en filas `BURNED` (`NULL` en `ATTRIBUTED`); inmutable tras el INSERT de reconciliación.
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
- **Recovery State** — estado operativo persistido por wallet version (`MerchantWalletRecoveryState`, DB-003) que actúa como **allocation-safety gate**: `RECOVERY_REQUIRED / RECONCILING / READY / RECOVERY_FAILED` (los mismos identificadores de ARCH-005 D6). Solo `lifecycle == ACTIVE AND recovery_state == READY` habilita asignar una nueva dirección derivada (DB-003 D4/D6).
- **Allocation-safety gate** — condición combinada `lifecycle == ACTIVE AND recovery_state == READY` que **debe** cumplirse antes de asignar un índice/dirección nuevos; cualquier ambigüedad aplica fail-closed; las versiones `RETIRED` nunca la satisfacen para asignar (DB-003 D6).
- **Initial safety establishment** — establecimiento de seguridad inicial de una wallet version nueva: inicia fail-closed (`RECOVERY_REQUIRED` + `INITIAL_ESTABLISHMENT`) y usa la misma máquina de estados que la recovery; alcanza `READY` **solo** tras probar HWM baseline + `safe_next_index` + identidad de Descriptor (DB-001) + monitoring live-verificado (DB-003 D5).
- **Monitoring-coverage claim (reclamación de cobertura de monitoring)** — metadata persistida por wallet version (`MerchantWalletDescriptorMonitoring`, DB-003) que **reclama** hasta qué índice fue live-verificada la cobertura de Descriptor monitoring; es evidencia operativa, **no** prueba durable de que el motor de runtime aún tenga esa cobertura (DB-003 D10).
- **Effective runtime monitoring engine** — el motor de monitoring en ejecución (Bitcoin Core); su cobertura actual debe **live-verificarse** y es **reconstruible** desde las fuentes durables de FloweyPay reimportando el Descriptor autoritativo; **no** es autoridad durable de identidad de wallet, HWM ni Recovery State (DB-003 D11/§17).
- **monitored_through_index** — índice de recepción más alto cuya cobertura de monitoring fue **live-verificada** en el momento de la reclamación (DB-003). Es una reclamación de cobertura; **no** es el Durable HWM ni un cursor de asignación, y avanza **solo** tras verificación live. Boundary ACTIVE: `≥ safe_next_index + lookahead`; boundary RETIRED: `≥ HWM(V)`.
- **monitoring_status** — estado de la reclamación de monitoring de una wallet version (DB-003): `PENDING / VERIFIED / STALE / ERROR`. `VERIFIED` es una reclamación, **no** prueba de runtime por sí sola.
- **last_verified_at** — timestamp de la última verificación live exitosa de la cobertura de monitoring contra el motor de runtime (DB-003); insumo de staleness, **no** autoridad.
- **state_reason** — código **estructurado** de vocabulario cerrado (DB-003 D17) que contextualiza un estado/transición de Recovery State: `INITIAL_ESTABLISHMENT`, `DB_RESTORE`, `HWM_INCONSISTENCY`, `CORE_STATE_LOST`, `MONITORING_INSUFFICIENT`, `RECONCILE_INTERRUPTED`. No es texto libre ni contiene secretos/RPC/descriptors crudos.
- **Operational PostgreSQL (PostgreSQL operativo)** — la instancia PostgreSQL de la aplicación (invoices, `Payment`, Allocation Ledger, Recovery State, monitoring metadata). En INFRA-001 está **separada** del Durable HWM PostgreSQL: restaurarla (Caso A) es rutinario y **no** mueve el HWM hacia atrás.
- **Durable HWM PostgreSQL (instancia dedicada)** — instancia PostgreSQL **dedicada** al Durable HWM (INFRA-001 D2 FINAL) con data directory, volumen, timeline WAL/PITR, backups y credenciales **propios**. Una **segunda base de datos en la instancia operativa es explícitamente insuficiente**; host/región separados = post-MVP hardening.
- **`consumeNext(walletVersionId, operationId)`** — operación atómica del `DurableHwmStore` (INFRA-001 D6/D7 FINAL) que devuelve `previous_HWM + 1` e incrementa el HWM en la **misma transacción** que el INSERT de la operación; `operationId` **obligatorio** con `UNIQUE(wallet_version_id, operation_id)`; idempotente ante reintentos (mismo `operationId` ⇒ mismo índice).
- **`establishBaseline`** — operación explícita (INFRA-001 D5) que fija el valor inicial del HWM de una wallet version (`-1` ⇒ primer consume `0`) o lo re-establece **solo hacia adelante** durante recovery, con guard monotónico-forward; nunca lo mueve hacia atrás.
- **operationId** — identificador de idempotencia **obligatorio** de cada `consumeNext` (INFRA-001 D7 FINAL); su unicidad `UNIQUE(wallet_version_id, operation_id)` garantiza que reintentos y duplicados concurrentes convergen a **un** único índice vía rollback + retry-on-unique-violation.
- **generation (Durable HWM)** — contador de INFRA-001 (D4 FINAL) usado para **CAS/optimistic concurrency**, guard monotónico-forward de `establishBaseline` y metadata de cross-check. **No** detecta el rollback del propio store del HWM (un rollback del store también rebobina `generation`); la detección de rollback es por reconciliación contra evidencia aprobada (D11 FINAL).
- **DurableHwmStore** — abstracción estrecha (librería, **no** microservicio) que encapsula el Durable HWM (INFRA-001 D19): expone `establishBaseline`/`consumeNext`/lectura; solo el path de creación de pagos avanza el HWM; el Worker es **solo lectura**.

---

Volver al [índice de documentación](./README.md).
