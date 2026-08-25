# 11 — Modelo de seguridad

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [10 — Modelo de negocio](./10-business-model.md).

Relacionado con [ARCH-001](./14-architecture-decisions.md) y [ARCH-003](./14-architecture-decisions.md).

---

## 11.1 Qué almacena FloweyPay

- Metadata pública de la wallet: Descriptor, checksum, Fingerprint, path, network, script type.
- Estado de derivación: índices asignados, índices fondeados, mapeo dirección↔invoice.
- Registros de invoice/pago y referencias públicas de transacción (txid, vout, montos, confirmaciones).
- Identidad de login del comercio (email) y artefactos OTP (hasheados).

## 11.2 Qué NUNCA almacena FloweyPay

- Seeds / mnemónicos.
- Private Keys.
- Cualquier material capaz de firmar o gastar.

## 11.3 Responsabilidades del comercio

- Resguardar la Seed y las Private Keys (su pérdida = pérdida permanente de fondos — escenario I).
- Verificar la Address #0 durante el onboarding.
- Nunca compartir la Seed; FloweyPay nunca la solicitará.
- Conservar el Recovery Package.

## 11.4 Modelo de amenazas (Threat Model)

| Amenaza | Mitigación |
|---|---|
| Compromiso de FloweyPay | Sin claves almacenadas → los fondos no se pueden mover; el radio de impacto es privacidad + disponibilidad. |
| Entrada de Descriptor equivocada/maliciosa | Parsing estricto BIP380; solo single-key P2WPKH; verificación obligatoria de Address #0. |
| Reutilización de índice / doble asignación | Índices atómicos, forward-only, no reciclados; **Durable HWM** monotónico protege incluso índices asignados-pero-no-fondeados; reconciliación **por wallet version** en la restauración (ARCH-005). |
| Rollback de DB | Probar el `safe_next_index` apoyándose en el **Durable HWM** (cuyo ciclo de persistencia es independiente del backup transaccional), no solo en la cadena; si no puede probarse, **fail-closed** (ver [ARCH-005](./ARCH-005-index-reconciliation-recovery.md) y [12 § 12.4](./12-operational-flow.md#124-ciclo-de-vida-de-recuperación-backup-reconciliation--arch-005)). |
| Phishing de la Seed | Advertencias explícitas y repetidas: "FloweyPay nunca pide tu Seed". |
| Prompt-injection vía datos importados | Tratar la entrada del comercio como no confiable; validar vía Bitcoin Core; no ejecutar nada. |

## 11.5 Modelo de privacidad

El Descriptor/XPUB es **el artefacto más sensible a la privacidad** — revela todas las direcciones pasadas y futuras y todo el historial de facturación. Tratar descriptors, Fingerprints e historial de índices fondeados/rotación como confidenciales; firmar y cifrar los Recovery Packages; restringir el acceso interno. La política de persistencia del material Descriptor (cifrado en reposo/backups, privilegio mínimo, acceso de servicios restringido, no loguear/telemetrizar/exponer el Descriptor completo; cifrado a nivel de columna **diferido**) se consolida en [DB-001 § 13](./DB-001-merchant-wallet-wallet-versions.md#13-seguridad--privacidad) (D16).

---

**Siguiente:** [12 — Flujo operativo](./12-operational-flow.md)
