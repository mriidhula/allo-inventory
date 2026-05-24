import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    type ProductWithStocks = typeof products[number]
    type StockWithWarehouse = ProductWithStocks['stocks'][number]

    const result = products.map((p: ProductWithStocks) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      price: p.price,
      warehouses: p.stocks.map((s: StockWithWarehouse) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        location: s.warehouse.location,
        total: s.total,
        reserved: s.reserved,
        available: s.total - s.reserved,
      })),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/products error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
