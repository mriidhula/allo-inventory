import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const reservation = await prisma.reservation.findUnique({ where: { id } })

  if (!reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  if (reservation.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Reservation is already ${reservation.status.toLowerCase()}` },
      { status: 409 }
    )
  }

  // Check expiry. If it's already past, clean up and return 410.
  if (reservation.expiresAt < new Date()) {
    await prisma.$transaction([
      prisma.stock.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: { reserved: { decrement: reservation.quantity } },
      }),
      prisma.reservation.update({
        where: { id },
        data: { status: 'RELEASED' },
      }),
    ])
    return NextResponse.json({ error: 'Reservation has expired' }, { status: 410 })
  }

  // Confirm: permanently reduce total stock and clear the reserved hold
  await prisma.$transaction([
    prisma.stock.updateMany({
      where: {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
      },
      data: {
        total: { decrement: reservation.quantity },
        reserved: { decrement: reservation.quantity },
      },
    }),
    prisma.reservation.update({
      where: { id },
      data: { status: 'CONFIRMED' },
    }),
  ])

  const confirmed = await prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  })

  return NextResponse.json({
    id: confirmed!.id,
    status: confirmed!.status,
    product: confirmed!.product.name,
    warehouse: confirmed!.warehouse.name,
    quantity: confirmed!.quantity,
    confirmedAt: confirmed!.updatedAt,
  })
}
