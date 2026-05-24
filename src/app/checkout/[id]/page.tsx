'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Reservation } from '@/lib/types'

type PageState =
  | { phase: 'loading' }
  | { phase: 'active'; reservation: Reservation; secondsLeft: number }
  | { phase: 'expired' }
  | { phase: 'confirmed'; reservation: Reservation }
  | { phase: 'cancelled' }
  | { phase: 'error'; message: string }

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [acting, setActing] = useState(false)

  // Unwrap the params promise
  useEffect(() => {
    params.then((p) => setReservationId(p.id))
  }, [params])

  // Load the reservation once we have the ID
  useEffect(() => {
    if (!reservationId) return

    fetch(`/api/reservations/${reservationId}`)
      .then((r) => r.json())
      .then((data: Reservation) => {
        const secondsLeft = Math.max(
          0,
          Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
        )
        if (data.status === 'CONFIRMED') {
          setState({ phase: 'confirmed', reservation: data })
        } else if (data.status === 'RELEASED' || secondsLeft === 0) {
          setState({ phase: 'expired' })
        } else {
          setState({ phase: 'active', reservation: data, secondsLeft })
        }
      })
      .catch(() => setState({ phase: 'error', message: 'Could not load reservation.' }))
  }, [reservationId])

  // Tick the countdown every second
  useEffect(() => {
    if (state.phase !== 'active') return

    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.phase !== 'active') return prev
        if (prev.secondsLeft <= 1) {
          clearInterval(interval)
          return { phase: 'expired' }
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [state.phase])

  const handleConfirm = useCallback(async () => {
    if (!reservationId) return
    setActing(true)
    try {
      const res = await fetch(`/api/reservations/${reservationId}/confirm`, { method: 'POST' })
      const data = await res.json()

      if (res.status === 410) {
        setState({ phase: 'expired' })
        return
      }
      if (!res.ok) {
        setState({ phase: 'error', message: data.error ?? 'Confirmation failed.' })
        return
      }

      setState((prev) =>
        prev.phase === 'active' ? { phase: 'confirmed', reservation: prev.reservation } : prev
      )
    } catch {
      setState({ phase: 'error', message: 'Network error. Please try again.' })
    } finally {
      setActing(false)
    }
  }, [reservationId])

  const handleCancel = useCallback(async () => {
    if (!reservationId) return
    setActing(true)
    try {
      const res = await fetch(`/api/reservations/${reservationId}/release`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setState({ phase: 'error', message: data.error ?? 'Could not cancel reservation.' })
        return
      }
      setState({ phase: 'cancelled' })
    } catch {
      setState({ phase: 'error', message: 'Network error. Please try again.' })
    } finally {
      setActing(false)
    }
  }, [reservationId])

  // ── Render states ──────────────────────────────────────────────────────────

  if (state.phase === 'loading') {
    return <CenteredMessage>Loading your reservation...</CenteredMessage>
  }

  if (state.phase === 'error') {
    return (
      <CenteredMessage>
        <p className="text-red-500">{state.message}</p>
        <button onClick={() => router.push('/')} className="mt-4 text-sm text-blue-600 underline">
          Back to products
        </button>
      </CenteredMessage>
    )
  }

  if (state.phase === 'expired') {
    return (
      <CenteredMessage>
        <p className="text-amber-600 font-medium text-lg">Your reservation expired</p>
        <p className="text-gray-500 text-sm mt-1">
          The 10-minute window passed and the items were released back into stock.
        </p>
        <button
          onClick={() => router.push('/')}
          className="mt-5 px-5 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          Browse products again
        </button>
      </CenteredMessage>
    )
  }

  if (state.phase === 'cancelled') {
    return (
      <CenteredMessage>
        <p className="text-gray-700 font-medium text-lg">Reservation cancelled</p>
        <p className="text-gray-500 text-sm mt-1">Stock has been released.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-5 px-5 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          Back to products
        </button>
      </CenteredMessage>
    )
  }

  if (state.phase === 'confirmed') {
    const r = state.reservation
    return (
      <CenteredMessage>
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3 mx-auto">
          <span className="text-green-600 text-xl">✓</span>
        </div>
        <p className="text-gray-900 font-semibold text-lg">Order confirmed</p>
        <p className="text-gray-500 text-sm mt-1">
          {r.quantity}× {r.product.name} from {r.warehouse.name}
        </p>
        <p className="text-gray-400 text-xs mt-1">Reservation ID: {r.id}</p>
        <button
          onClick={() => router.push('/')}
          className="mt-5 px-5 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          Continue shopping
        </button>
      </CenteredMessage>
    )
  }

  // Active reservation
  const { reservation: r, secondsLeft } = state
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const urgency = secondsLeft < 60

  return (
    <main className="max-w-lg mx-auto px-4 py-14">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Checkout</h1>
      <p className="text-sm text-gray-500 mb-8">Review and confirm your reservation.</p>

      {/* Order summary */}
      <div className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm mb-5">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Order summary</p>
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium text-gray-900">{r.product.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              SKU: {r.product.sku} · from {r.warehouse.name}
            </p>
          </div>
          <p className="font-semibold text-gray-900">
            ₹{(r.product.price * r.quantity).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between text-sm">
          <span className="text-gray-500">Qty</span>
          <span className="font-medium">{r.quantity}</span>
        </div>
      </div>

      {/* Countdown */}
      <div
        className={`rounded-lg px-5 py-4 mb-6 flex items-center justify-between ${
          urgency ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
        }`}
      >
        <div>
          <p className={`text-sm font-medium ${urgency ? 'text-red-700' : 'text-amber-700'}`}>
            {urgency ? 'Hurry — almost expired' : 'Reservation held for'}
          </p>
          <p className={`text-xs mt-0.5 ${urgency ? 'text-red-500' : 'text-amber-500'}`}>
            Complete checkout before the timer runs out
          </p>
        </div>
        <span
          className={`text-2xl font-mono font-bold tabular-nums ${
            urgency ? 'text-red-600' : 'text-amber-700'
          }`}
        >
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={acting}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait"
        >
          {acting ? 'Processing...' : 'Confirm purchase'}
        </button>
        <button
          onClick={handleCancel}
          disabled={acting}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </main>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      {children}
    </div>
  )
}
