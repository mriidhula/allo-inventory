export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const expired = await prisma.reservation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
  })

  if (expired.length === 0) {
    return NextResponse.json({ released: 0 })
  }

  let released = 0
  for (const res of expired) {
    try {
      await prisma.$transaction([
        prisma.stock.updateMany({
          where: { productId: res.productId, warehouseId: res.warehouseId },
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

  return NextResponse.json({ released })
}
