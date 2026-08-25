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

## 5.6 Payment Link expirado (ARCH-006 — diseño aprobado)

Al expirar el Payment Link, FloweyPay **deja de incentivar activamente el pago** ([ARCH-006 D8](./ARCH-006-late-payments-reconciliation.md#d8--expired-payment-link-must-not-remain-payable)). La página expirada **no** debe exponer QR pagable ni acciones de pago activas ("Open Wallet", "Copy Address"); la dirección **puede** permanecer visible como información **read-only** de soporte, y se instruye al cliente a **solicitar un nuevo Payment Link**. Como los BTC van directo a una dirección controlada por el comercio, FloweyPay **no puede** rechazar un pago tardío ya difundido: si se detecta uno, la página puede comunicar que el link estaba expirado y que hay un pago detectado / revisión pendiente, **sin** ofrecer otra acción de pago. El tratamiento de esos pagos tardíos se define en [ARCH-006](./ARCH-006-late-payments-reconciliation.md).

> **Observación (implementación actual).** Hoy la página de pago aún renderiza el QR y la dirección tras expirar (solo deshabilita "Copy" y marca "Open Wallet" como `aria-disabled`, sin bloquear el `href`). Ajustar este comportamiento es trabajo de implementación de ARCH-006 (D8); esta documentación describe el target aprobado.

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Pago del cliente](./13-sequence-diagrams.md#133-pago-del-cliente).

---

**Siguiente:** [06 — Procesamiento Bitcoin](./06-bitcoin-processing.md)
