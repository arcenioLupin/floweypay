# FloweyPay — BTC Payment Links (MVP)

MVP de links de pago Bitcoin on-chain (fiat-first):
- El creador define precio en fiat (USD/EUR/PEN)
- El link público inicia un invoice con rate lock + expiración
- El pagador ve QR/address + timeline de estado

## Tech
- Next.js (App Router)
- TypeScript
- PostgreSQL (Docker)

## Monorepo
- `apps/*`
- `packages/*`
- `docker/docker-compose.yml` (Postgres)

## Requisitos
- Node.js + npm
- Docker

## Setup local

### 1) Instalar deps
```bash
npm install
```

### 2) Levantar Postgres
```bash
npm run db:up
```

## Postgres (local):
    Host: localhost

    Port: 5433

    User: floweypay

    Password: floweypay

    DB: floweypay

### 3) Correr web

```bash
npm run dev
```

## Comandos útiles
```bash
npm run db:down
npm run db:reset
npm run build
npm run start
```

