# 10 — Modelo de negocio

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [09 — Wallet Rotation](./09-wallet-rotation.md).

> **Observación.** No existen tablas de suscripción/facturación en el repositorio actual. Esta sección documenta el posicionamiento previsto, no una facturación implementada.

---

## 10.1 Planes de suscripción

FloweyPay se posiciona como un **SaaS de suscripción** para comercios (escalonado por volumen, funcionalidades y soporte). Las suscripciones financian la plataforma **sin tocar el valor del pago** — de forma consistente con la no custodia, FloweyPay no deduce del BTC liquidado.

## 10.2 Posibilidades futuras de comisión por transacción

Se podría explorar un modelo de comisión opcional a futuro, pero cualquier modelo de este tipo debe preservar la no custodia (p. ej., facturado por separado, nunca retenido de los fondos del comercio). Se documenta como una posibilidad, no como una decisión aprobada.

## 10.3 Posicionamiento de la plataforma

FloweyPay se diferencia por **cero custodia, independencia de recuperación e interoperabilidad de wallets** — un *procesador* de pagos, nunca un *custodio*.

---

**Siguiente:** [11 — Modelo de seguridad](./11-security-model.md)
