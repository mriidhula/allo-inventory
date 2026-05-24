'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Product } from '@/lib/types'

export default function HomePage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reserving, setReserving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => setError('Could not load products. Is the database connected?'))
      .finally(() => setLoading(false))
  }, [])

  async function handleReserve(productId: string, warehouseId: string) {
    const key = `${productId}:${warehouseId}`
    setReserving(key)
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      })
      const data = await res.json()

      if (!res.ok) {
        alert(data.error ?? 'Something went wrong')
        return
      }

      router.push(`/checkout/${data.id}`)
    } catch {
      alert('Network error — please try again')
    } finally {
      setReserving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading products...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Products</h1>
      <p className="text-sm text-gray-500 mb-8">
        Stock is live. Reservations hold for 10 minutes.
      </p>

      <div className="space-y-6">
        {products.map((product) => (
          <div key={product.id} className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-lg font-medium text-gray-900">{product.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku}</p>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                ₹{product.price.toLocaleString('en-IN')}
              </span>
            </div>

            {product.description && (
              <p className="text-sm text-gray-600 mb-4">{product.description}</p>
            )}

            <div className="mt-4 space-y-2">
              {product.warehouses.map((w) => {
                const key = `${product.id}:${w.warehouseId}`
                const isReserving = reserving === key
                const outOfStock = w.available <= 0

                return (
                  <div
                    key={w.warehouseId}
                    className="flex items-center justify-between bg-gray-50 rounded-md px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{w.warehouseName}</p>
                      <p className="text-xs text-gray-400">{w.location}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <StockBadge available={w.available} />

                      <button
                        onClick={() => handleReserve(product.id, w.warehouseId)}
                        disabled={outOfStock || isReserving}
                        className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${
                          outOfStock
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : isReserving
                            ? 'bg-blue-400 text-white cursor-wait'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isReserving ? 'Reserving...' : outOfStock ? 'Out of stock' : 'Reserve'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

function StockBadge({ available }: { available: number }) {
  if (available <= 0) {
    return <span className="text-xs text-red-500 font-medium">0 left</span>
  }
  if (available <= 3) {
    return <span className="text-xs text-amber-600 font-medium">Only {available} left</span>
  }
  return <span className="text-xs text-green-600 font-medium">{available} available</span>
}
