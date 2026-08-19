# 05 — Flujo de pago del cliente

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [04 — Creación de Payment Link](./04-payment-link-creation.md).

---

## 5.1 Apertura del link

El cliente abre el link público del comercio. FloweyPay inicia (o reutiliza) un invoice activo y presenta la página de pago. No se requiere cuenta de cliente.

## 5.2 Revisión del pago

El cliente ve: monto fiat, monto exacto en BTC (sats), la dirección de recepción única, la network, la cuenta regresiva de expiración y el estado actual en un timeline de 4 pasos (Awaiting → Mempool → Confirming → Confirmed).

## 5.3 Escaneo del QR y envío de BTC

El cliente escanea el QR BIP21 (o copia dirección + monto) en **su propia** wallet y envía el pago. Los fondos van **directamente a la dirección controlada por el comercio** — FloweyPay nunca está en la ruta de valor.

## 5.4 Difusión (broadcast)

La wallet del cliente difunde la transacción a la red Bitcoin, donde entra al mempool y se propaga a los nodos, incluido el nodo observador de FloweyPay.

## 5.5 Casos borde de pago

Se manejan subpagos (*underpayment*), sobrepagos (*overpayment*) y pagos con múltiples outputs; se acumulan por invoice. El invoice avanza solo cuando lo recibido ≥ lo esperado.

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Pago del cliente](./13-sequence-diagrams.md#133-pago-del-cliente).

---

**Siguiente:** [06 — Procesamiento Bitcoin](./06-bitcoin-processing.md)
