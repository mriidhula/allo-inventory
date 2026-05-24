import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Called by Vercel Cron every minute (see vercel.json)
// Protected by a shared secret so only Vercel can hit it
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find all PENDING reservations whose window has passed
  const expired = await prisma.reservation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
  })

  if (expired.length === 0) {
    return NextResponse.json({ released: 0 })
  }

  // Release each one in a transaction so stock is always consistent
  let released = 0
  for (const res of expired) {
    try {
      await prisma.$transaction([
        prisma.stock.updateMany({
          where: {
            productId: res.productId,
            warehouseId: res.warehouseId,
          },
          data: { reserved: { decrement: res.quantity } },
        }),
        prisma.reservation.update({
          where: { id: res.id },
          data: { status: 'RELEASED' },
        }),
      ])
      released++
    } catch (err) {
      console.error(`Failed to release reservation ${res.id}:`, err)
    }
  }

  console.log(`[cron] Released ${released} expired reservations`)
  return NextResponse.json({ released })
}
