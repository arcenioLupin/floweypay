# 01 — Resumen ejecutivo

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Ver el índice en [README.md](./README.md).

---

## 1.1 Qué es FloweyPay

FloweyPay es una **plataforma de procesamiento de pagos Bitcoin non-custodial**. Permite a los comercios aceptar pagos on-chain y genera **una dirección de recepción única por invoice** derivada de la información **pública** de la wallet del comercio.

FloweyPay explícitamente **no es** una wallet, **no es** un custodio y **nunca** firma transacciones. Nunca retiene, mueve ni tiene la capacidad de gastar los fondos del comercio. Los pagos fluyen **directamente del cliente a una dirección que el comercio controla**.

## 1.2 Problemas que resuelve

- **Riesgo de custodia.** Los procesadores tradicionales retienen fondos, creando riesgo de contraparte, regulatorio y de insolvencia. FloweyPay elimina la custodia por completo: los fondos llegan a direcciones que solo la Seed del comercio puede gastar.
- **Reutilización de direcciones y privacidad.** Reutilizar una única dirección expone todo el historial de facturación. FloweyPay emite una dirección nueva por invoice (ARCH-002).
- **Complejidad de conciliación.** Asociar un pago on-chain a una orden concreta es difícil. Una dirección única por invoice hace la conciliación determinista.
- **Interoperabilidad de wallets.** Los comercios usan wallets diversas. FloweyPay normaliza entradas públicas variadas (Descriptor / XPUB / ZPUB) a un único **Output Descriptor BIP84** canónico (ARCH-001).
- **Independencia de recuperación.** El comercio debe poder recuperar fondos incluso si FloweyPay desaparece. El **Recovery Package** (ARCH-003) lo garantiza.

## 1.3 Filosofía Non-Custodial

| FloweyPay **sí** hace | FloweyPay **nunca** hace |
|---|---|
| Almacenar material **público** de la wallet (Descriptor, Fingerprint, path, network) | Almacenar Seeds o Private Keys |
| Derivar direcciones de recepción a partir de claves públicas | Firmar o difundir transacciones de gasto |
| Observar la blockchain en modo Watch-only | Mover, barrer o retener fondos del comercio |
| Registrar el estado de invoices/pagos | Ser una parte requerida para la recuperación de fondos |

El comercio es **siempre** el único propietario de la Seed y las Private Keys. El conocimiento de FloweyPay es estrictamente **Watch-only**.

## 1.4 Objetivos del producto

1. Aceptación de Bitcoin con cero custodia para comercios.
2. Emisión de direcciones por invoice de forma determinista y privada.
3. Detección y confirmación de pagos confiable.
4. Independencia del comercio para recuperar fondos sin FloweyPay.
5. Interoperabilidad de wallets sobre el conjunto soportado en ARCH-003.
6. Seguridad operativa: índices forward-only, monitoring considerando el Gap Limit, Wallet Rotation y backup reconciliation.

---

**Siguiente:** [02 — Arquitectura de alto nivel](./02-high-level-architecture.md)
