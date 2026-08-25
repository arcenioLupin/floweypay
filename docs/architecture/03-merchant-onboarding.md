# 03 — Onboarding del comercio

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [02 — Arquitectura de alto nivel](./02-high-level-architecture.md).

Implementa las decisiones de [ARCH-001](./14-architecture-decisions.md) y [ARCH-002](./14-architecture-decisions.md).

---

## 3.1 Registro y login OTP

La autenticación es por **OTP de email** (building block existente):

- El comercio solicita un código: TTL de 10 minutos, cooldown de 60 segundos, los códigos activos previos se invalidan.
- El comercio envía el código: máximo 5 intentos, consumo de un solo uso mediante lock optimista.

**Por qué:** el OTP sin contraseña reduce la superficie de robo de credenciales; no hay un secreto persistente que se pueda phishing. El login concede acceso solo a la superficie de **gestión**; **no** concede control alguno sobre los fondos.

## 3.2 Configuración de la wallet

El comercio provee material **público** de su wallet en uno de los formatos aceptados (ARCH-001):

- **Output Descriptor** (preferido — Sparrow, Bitcoin Core, Nunchuk).
- **XPUB** o **ZPUB** (Electrum, BlueWallet — con limitaciones).

El comercio también selecciona la **network** (mainnet vs signet/testnet).

## 3.3 Validación del Descriptor

FloweyPay normaliza toda entrada a la forma canónica BIP84:

```
wpkh([fingerprint/84h/coin_typeh/accounth]xpub/0/*)#checksum
```

Pasos de validación (funcionales):

1. Parsear/convertir la entrada (decodificar ZPUB→XPUB, adjuntar Fingerprint/path cuando la entrada no los incluye).
2. Exigir **P2WPKH / BIP84 single-key** únicamente — rechazar legacy, Wrapped SegWit, Multisig, Taproot.
3. Exigir un **coin type** acorde a la network seleccionada (mainnet `0'`, signet/testnet/regtest `1'`).
4. Confirmar el **checksum** con Bitcoin Core.

## 3.4 Verificación de Address #0 (obligatoria — ARCH-001)

Bitcoin Core deriva la **Address #0** del Descriptor. El comercio debe confirmar que esta dirección coincide con el índice 0 en su propia wallet (en pantalla para hardware wallets). **No hay activación sin coincidencia.**

**Por qué:** este único paso protege contra toda la clase de errores de "cuenta equivocada / script type equivocado / xpub corrupto" (ARCH-003, escenario G). Demuestra criptográficamente que el comercio controla las claves detrás del material público.

## 3.5 Activación de la wallet

Ante una coincidencia exitosa, FloweyPay:

- Persiste la **metadata de la wallet** — wallet ID, network, script type, Derivation Path, Fingerprint, Descriptor, checksum (ARCH-002). En el modelo de persistencia aprobado, esta metadata corresponde a una **`MerchantWalletVersion`** `ACTIVE` bajo el `MerchantWallet` del comercio ([DB-001](./DB-001-merchant-wallet-wallet-versions.md) — diseño aprobado; implementación pendiente).
- Inicializa el cursor de asignación de direcciones en 0. **Observación (aprobada):** cualquier `next_address_index` mutable es una descripción funcional simplificada y **no** es la autoridad de asignación/recuperación. La autoridad aprobada es el **Allocation Ledger** (DB-002) más el **Durable HWM** (INFRA-001) con reconciliación por wallet version ([ARCH-005](./ARCH-005-index-reconciliation-recovery.md)). DB-001 **no** persiste ningún cursor/índice.
- Instruye a Bitcoin Core a **observar un rango explícito del Descriptor, adelantado a la asignación** (ARCH-002).

## 3.6 Casos de falla

| Falla | Comportamiento |
|---|---|
| Script type no soportado / Multisig / Taproot | Rechazar con explicación; wallet no activada. |
| Checksum inválido | Rechazar; solicitar re-exportar. |
| Mismatch de network/coin type | Rechazar; solicitar selección de network correcta. |
| Mismatch de Address #0 | **Bloquear activación** (probable cuenta/script equivocado). |
| Falta Fingerprint/path (entradas ZPUB) | Reconstruir + exigir igualmente verificación de Address #0. |
| Bitcoin Core no disponible | Fallo seguro: sin activación; error reintentable. |

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Onboarding](./13-sequence-diagrams.md#131-onboarding-del-comercio).

---

**Siguiente:** [04 — Creación de Payment Link](./04-payment-link-creation.md)
