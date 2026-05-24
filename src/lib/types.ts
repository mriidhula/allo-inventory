export type WarehouseStock = {
  warehouseId: string
  warehouseName: string
  location: string
  total: number
  reserved: number
  available: number
}

export type Product = {
  id: string
  name: string
  sku: string
  description: string | null
  price: number
  warehouses: WarehouseStock[]
}

export type Reservation = {
  id: string
  product: {
    id: string
    name: string
    sku: string
    price: number
  }
  warehouse: {
    id: string
    name: string
  }
  quantity: number
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED'
  expiresAt: string
  createdAt: string
}
