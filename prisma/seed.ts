import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Warehouses
  const delhi = await prisma.warehouse.upsert({
    where: { id: 'wh-delhi' },
    update: {},
    create: { id: 'wh-delhi', name: 'Delhi Central', location: 'New Delhi' },
  })

  const mumbai = await prisma.warehouse.upsert({
    where: { id: 'wh-mumbai' },
    update: {},
    create: { id: 'wh-mumbai', name: 'Mumbai West', location: 'Mumbai' },
  })

  const bangalore = await prisma.warehouse.upsert({
    where: { id: 'wh-bangalore' },
    update: {},
    create: { id: 'wh-bangalore', name: 'Bangalore Tech Park', location: 'Bangalore' },
  })

  // Products
  const products = [
    { id: 'prod-001', name: 'Wireless Headphones', sku: 'WH-PRO-X1', description: 'Noise-cancelling over-ear headphones', price: 4999 },
    { id: 'prod-002', name: 'Mechanical Keyboard', sku: 'KB-MECH-75', description: 'TKL 75% mechanical keyboard, red switches', price: 6499 },
    { id: 'prod-003', name: 'USB-C Hub 7-in-1', sku: 'HUB-C-7P', description: 'HDMI, USB-A, SD card, PD charging', price: 2299 },
    { id: 'prod-004', name: 'Ergonomic Mouse', sku: 'MS-ERGO-V2', description: 'Vertical ergonomic wireless mouse', price: 3199 },
  ]

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    })
  }

  // Stock levels per product per warehouse
  const stockEntries = [
    // Headphones
    { productId: 'prod-001', warehouseId: delhi.id, total: 12 },
    { productId: 'prod-001', warehouseId: mumbai.id, total: 8 },
    { productId: 'prod-001', warehouseId: bangalore.id, total: 3 }, // deliberately low
    // Keyboard
    { productId: 'prod-002', warehouseId: delhi.id, total: 20 },
    { productId: 'prod-002', warehouseId: mumbai.id, total: 5 },
    // USB Hub
    { productId: 'prod-003', warehouseId: delhi.id, total: 1 }, // only one left — good for testing 409
    { productId: 'prod-003', warehouseId: bangalore.id, total: 15 },
    // Mouse
    { productId: 'prod-004', warehouseId: mumbai.id, total: 9 },
    { productId: 'prod-004', warehouseId: bangalore.id, total: 6 },
  ]

  for (const s of stockEntries) {
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: s.productId, warehouseId: s.warehouseId } },
      update: {},
      create: { ...s, reserved: 0 },
    })
  }

  console.log('Done. Warehouses:', [delhi.name, mumbai.name, bangalore.name].join(', '))
  console.log('Products seeded:', products.map((p) => p.name).join(', '))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
