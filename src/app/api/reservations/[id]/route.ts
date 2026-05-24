import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  })

  if (!reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: reservation.id,
    product: {
      id: reservation.product.id,
      name: reservation.product.name,
      sku: reservation.product.sku,
      price: reservation.product.price,
    },
    warehouse: {
      id: reservation.warehouse.id,
      name: reservation.warehouse.name,
    },
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    createdAt: reservation.createdAt,
  })
}
