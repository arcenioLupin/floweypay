# 04 — Creación de Payment Link

> Parte de la Especificación de Arquitectura Funcional (ARCH-004). Anterior: [03 — Onboarding del comercio](./03-merchant-onboarding.md).

Implementa [ARCH-002](./14-architecture-decisions.md) (derivación de direcciones).

---

## 4.1 El comercio crea un pago

Un comercio crea un **Payment Link** asociado a un producto (con precio en fiat). Cuando un cliente abre el link, se inicia un **invoice** (pago). El Payment Link se identifica con un token URL-safe y expone una URL pública `/p/<token>`.

## 4.2 Validación

- El producto debe pertenecer al comercio solicitante.
- La wallet del comercio debe estar **activa** (Descriptor verificado).
- El monto fiat y la moneda deben ser válidos; los sats derivados deben estar dentro de los límites.

## 4.3 Derivación de dirección y reserva de índice (ARCH-002)

Para cada nuevo invoice, FloweyPay:

1. **Reserva atómicamente** el siguiente índice de derivación (forward-only, nunca reutilizado).
2. Deriva la dirección de recepción en `m/84'/coin_type'/account'/0/index` vía Bitcoin Core.
3. Registra wallet ID, índice, path, network y dirección contra el invoice.

**Por qué atómico + forward-only:** la creación concurrente de invoices nunca debe entregar la misma dirección a dos clientes, y un índice ya asignado nunca debe reutilizarse — la reutilización mezclaría pagos no relacionados y filtraría privacidad.

> **Seguridad de asignación (ARCH-005 — diseño aprobado, implementación pendiente).** En el modelo target, la asignación de un índice solo procede si la wallet version está `ACTIVE` **y** `recovery_state == READY`. La reserva registra la asignación en el **Allocation Ledger** y **no** expone la dirección hasta que el avance del **Durable High-Water Mark (HWM)** esté durablemente confirmado (visibilidad diferida). Si no puede probarse un `safe_next_index`, la asignación se **bloquea** (fail-closed) en lugar de arriesgar una reutilización. Ver [ARCH-005](./ARCH-005-index-reconciliation-recovery.md).

## 4.4 Creación del invoice, rate lock y expiración

- El fiat se convierte a sats bajo un **rate lock** al crear el invoice; `btc_expires_at = now + rateLockMinutes` (por defecto 15).
- Se previenen invoices activos duplicados para el mismo link+ventana mediante serialización con advisory lock.
- La expiración se aplica de dos formas (defensa en profundidad): el Worker persiste `EXPIRED` para invoices vencidos en `AWAITING_PAYMENT`, y el endpoint de lectura computa un estado efectivo pasada la expiración.
- Como la dirección derivada sigue siendo válida en la red tras la expiración, un pago puede llegar a un invoice ya `EXPIRED`. El invoice **permanece `EXPIRED`** (inmutable) y ese pago tardío se detecta y concilia por separado según [ARCH-006](./ARCH-006-late-payments-reconciliation.md) (diseño aprobado; implementación pendiente).

## 4.5 Generación de QR y página pública de pago

FloweyPay renderiza una página pública en `/pay/<paymentId>` (enlazada desde `/p/<token>`) que muestra monto, dirección, un QR con URI `bitcoin:` (BIP21), cuenta regresiva y un timeline de estado en vivo.

Diagrama de secuencia: ver [13 — Diagramas de secuencia § Creación de pago](./13-sequence-diagrams.md#132-creación-de-pago).

---

**Siguiente:** [05 — Flujo de pago del cliente](./05-customer-payment-flow.md)
