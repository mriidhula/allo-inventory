import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { acquireLock, releaseLock } from '@/lib/redis'

const ReserveBody = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().positive(),
})

const RESERVATION_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function POST(req: NextRequest) {
  // Idempotency key support
  const idempotencyKey = req.headers.get('idempotency-key')

  if (idempotencyKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    })
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json(existing.response, { status: existing.statusCode })
    }
  }

  const body = await req.json().catch(() => null)
  const parsed = ReserveBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const { productId, warehouseId, quantity } = parsed.data

  // Lock key is scoped to the specific product+warehouse combo
  const lockKey = `reserve:${productId}:${warehouseId}`
  const lockToken = await acquireLock(lockKey, 5000)

  // If Redis is unavailable we fall back to a DB-level approach (see below)
  // Both paths are safe under concurrency — Redis lock is the fast path,
  // the Postgres UPDATE ... WHERE available >= quantity is the safety net.

  try {
    // This UPDATE is atomic at the DB level. Even without Redis, two concurrent
    // requests can't both decrement past zero because Postgres processes row
    // locks serially. The WHERE clause is the invariant.
    const updated = await prisma.$executeRaw`
      UPDATE "Stock"
      SET reserved = reserved + ${quantity}
      WHERE "productId" = ${productId}
        AND "warehouseId" = ${warehouseId}
        AND (total - reserved) >= ${quantity}
    `

    if (updated === 0) {
      const respond = (data: object, status: number) => {
        if (idempotencyKey) saveIdempotencyKey(idempotencyKey, data, status)
        return NextResponse.json(data, { status })
      }
      return respond({ error: 'Not enough stock available' }, 409)
    }

    const reservation = await prisma.reservation.create({
      data: {
        productId,
        warehouseId,
        quantity,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      },
      include: {
        product: true,
        warehouse: true,
      },
    })

    const responseData = {
      id: reservation.id,
      product: { id: reservation.product.id, name: reservation.product.name, sku: reservation.product.sku, price: reservation.product.price },
      warehouse: { id: reservation.warehouse.id, name: reservation.warehouse.name },
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
    }

    if (idempotencyKey) await saveIdempotencyKey(idempotencyKey, responseData, 201)
    return NextResponse.json(responseData, { status: 201 })
  } finally {
    if (lockToken) await releaseLock(lockKey, lockToken)
  }
}

async function saveIdempotencyKey(key: string, response: object, statusCode: number) {
  await prisma.idempotencyKey.upsert({
    where: { key },
    update: { response, statusCode, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    create: { key, response, statusCode, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  })
}
