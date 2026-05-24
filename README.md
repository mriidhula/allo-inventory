# Allo Inventory

A multi-warehouse inventory and reservation system built with Next.js, Prisma, and PostgreSQL.

The core problem: when a customer proceeds to checkout, payment can take a few minutes (3DS, UPI, wallet flows). If two people check out simultaneously for the last unit, naive stock decrement-on-payment means both can pay for the same physical item. This app solves that with a reservation layer — units are held for 10 minutes at checkout start, then either confirmed (payment succeeded) or released (timer ran out or user cancelled).

---

## Running locally

**1. Clone and install**

```bash
git clone <repo-url>
cd allo-inventory
npm install
```

**2. Set up environment variables**

```bash
cp .env.example .env.local
```

Fill in `DATABASE_URL` and `REDIS_URL`. For a quick setup:
- Postgres: [Neon](https://neon.tech) or [Supabase](https://supabase.com) — both have free tiers, no credit card needed
- Redis: [Upstash](https://upstash.com) — free tier, works out of the box

`REDIS_URL` is optional. If it's not set, the app logs a warning and falls back to DB-level locking (see the concurrency section below).

`CRON_SECRET` can be any random string locally — the cron endpoint is only hit by Vercel in production.

**3. Run migrations and seed the database**

```bash
npx prisma migrate dev --name init
npm run db:seed
```

The seed creates 3 warehouses (Delhi, Mumbai, Bangalore) and 4 products with varying stock levels. One item (USB-C Hub, Delhi) is seeded with a single unit on purpose — useful for testing the 409 race condition.

**4. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How expiry works in production

Reservations have an `expiresAt` timestamp set 10 minutes after creation. There are two things working together to clean them up:

**Lazy cleanup on read**: When a confirm request comes in, we check `expiresAt` before doing anything. If it's in the past, we release the stock and return a 410 right there. This means even if the background job is delayed, the reservation can't be double-confirmed.

**Vercel Cron** (`vercel.json`): A cron job hits `/api/cron/expire-reservations` every minute. It queries for PENDING reservations where `expiresAt < now` and releases them in individual transactions. Each one gets its own try/catch so a single failure doesn't block the rest. The endpoint is protected by a `CRON_SECRET` header to prevent public access.

The two approaches complement each other: the cron handles the bulk of cleanup proactively, and lazy cleanup is the safety net.

For a higher-throughput system, I'd look at Redis keyspace notifications instead — set a TTL on a Redis key when the reservation is created, and handle the expiry event in a worker. That's lower latency and cheaper than polling, but it adds operational complexity (you need a persistent Redis connection, not just a cache). For this scale, the cron approach is the right tradeoff.

---

## How concurrency works

This is the interesting part.

When two requests hit `POST /api/reservations` at the same time for the last unit of a SKU, exactly one should succeed and the other should get a 409. The guarantee comes from this raw SQL update:

```sql
UPDATE "Stock"
SET reserved = reserved + :quantity
WHERE "productId" = :productId
  AND "warehouseId" = :warehouseId
  AND (total - reserved) >= :quantity
```

Postgres processes this as a single atomic operation. If two transactions try to update the same row concurrently, the database serializes them — the second one sees the row already modified by the first and the WHERE clause fails, returning 0 rows updated. We check the affected row count and return 409 if it's 0.

Redis locking (via `lib/redis.ts`) is layered on top as an optimization. It prevents unnecessary DB round-trips when we already know two requests are racing. But it's not load-bearing — if Redis is down, the DB-level WHERE clause is the actual invariant. The app logs a warning and keeps working.

---

## Idempotency (bonus)

The `POST /api/reservations` endpoint supports an `Idempotency-Key` header. If a client retries with the same key (e.g. after a network timeout), the server returns the original response without creating a duplicate reservation. Keys are stored in an `IdempotencyKey` table with a 24-hour TTL.

Usage:

```
POST /api/reservations
Idempotency-Key: <any unique string, e.g. a UUID>
```

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | Products with available stock per warehouse |
| GET | `/api/warehouses` | All warehouses |
| POST | `/api/reservations` | Reserve units. Returns 409 if not enough stock |
| GET | `/api/reservations/:id` | Get a single reservation |
| POST | `/api/reservations/:id/confirm` | Confirm (payment succeeded). Returns 410 if expired |
| POST | `/api/reservations/:id/release` | Release early (cancelled or payment failed) |

---

## Trade-offs and things I'd revisit

**No auth.** Reservations aren't tied to a user session, so any client can confirm or cancel any reservation by ID. In production you'd attach reservations to a session or user record and gate the confirm/release endpoints.

**No pagination.** The products endpoint returns everything. Fine for a seed dataset, would need cursor-based pagination at scale.

**Cron granularity.** Vercel Cron runs at most once per minute. A reservation could sit expired for up to 60 seconds before cleanup. For most use cases this is fine — the lazy-cleanup on confirm is the real guard. If you need tighter windows, a Redis TTL + keyspace notification approach would get you sub-second cleanup.

**Stock goes negative if there's a bug.** There's no DB-level CHECK constraint on `total - reserved >= 0`. It relies on the WHERE clause in the reservation update being correct. I'd add a CHECK constraint in a migration before going to production.

**Seed is not idempotent on stock.** Running the seed twice won't double-count products or warehouses, but stock entries are upserted with `reserved: 0`, which would reset any in-progress reservations. Fine for development.
