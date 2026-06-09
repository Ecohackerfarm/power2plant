'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { TopUpModal } from '@/components/top-up-modal'

function centsToEuros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

export function UserBalance() {
  const { data: session, isPending } = useSession()
  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true)
    try {
      const res = await fetch('/api/credits/balance')
      if (res.ok) {
        const data = await res.json()
        setBalanceCents(data.balanceCents)
      }
    } finally {
      setLoadingBalance(false)
    }
  }, [])

  useEffect(() => {
    if (session) fetchBalance()
  }, [session, fetchBalance])

  if (isPending || !session) return null

  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {loadingBalance || balanceCents === null ? '…' : centsToEuros(balanceCents)}
        </span>
        <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
          Top up
        </Button>
      </div>

      {modalOpen && (
        <TopUpModal
          onClose={() => setModalOpen(false)}
          onBalanceUpdate={cents => setBalanceCents(cents)}
        />
      )}
    </>
  )
}
