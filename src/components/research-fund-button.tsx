'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { TopUpModal } from '@/components/top-up-modal'
import { ExternalLink } from 'lucide-react'

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const KOFI_BASE = process.env.NEXT_PUBLIC_KOFI_URL?.startsWith('https://')
  ? process.env.NEXT_PUBLIC_KOFI_URL : undefined

function centsToEuros(cents: number) {
  return `€${(cents / 100).toFixed(2)}`
}

type Props = {
  cropAName: string
  cropBName: string
  cropAId: string
  cropBId: string
  signedIn: boolean
  onRequireSignIn: () => void
}

type FundState = 'idle' | 'confirm' | 'loading' | 'queued' | 'already-queued' | 'error'

export function ResearchFundButton({ cropAName, cropBName, cropAId, cropBId, signedIn, onRequireSignIn }: Props) {
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [fundState, setFundState] = useState<FundState>('idle')
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [balanceCents, setBalanceCents] = useState<number | null>(null)

  const pairKey = cropAId < cropBId ? `${cropAId}-${cropBId}` : `${cropBId}-${cropAId}`

  useEffect(() => {
    fetch('/api/research-queue')
      .then(r => r.ok ? r.json() : null)
      .then((d: { priceCents: number; balanceCents: number | null } | null) => {
        if (!d) return
        setPriceCents(d.priceCents)
        setBalanceCents(d.balanceCents)
      })
      .catch(() => {})
  }, [])

  const hasFunds = priceCents !== null && balanceCents !== null && balanceCents >= priceCents

  function handleClick() {
    if (!STRIPE_PK) return
    if (!signedIn) {
      onRequireSignIn()
      return
    }
    if (hasFunds) {
      setFundState('confirm')
    } else {
      setTopUpOpen(true)
    }
  }

  async function handleConfirm() {
    setFundState('loading')
    try {
      const res = await fetch('/api/research-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cropAId, cropBId }),
      })
      if (res.status === 409) { setFundState('already-queued'); return }
      if (!res.ok) { setFundState('error'); return }
      const data = await res.json() as { balanceCents: number }
      setBalanceCents(data.balanceCents)
      setFundState('queued')
    } catch {
      setFundState('error')
    }
  }

  if (fundState === 'confirm') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground text-xs">
          ~{priceCents !== null ? centsToEuros(priceCents) : '…'} from your account
        </span>
        <Button size="sm" onClick={handleConfirm}>Confirm</Button>
        <button
          className="text-xs text-muted-foreground hover:text-foreground underline"
          onClick={() => setFundState('idle')}
        >
          Cancel
        </button>
      </div>
    )
  }

  if (fundState === 'loading') {
    return <Button size="sm" disabled>Queuing…</Button>
  }

  if (fundState === 'queued') {
    return <span className="text-xs text-green-700 font-medium">Queued ✓</span>
  }

  if (fundState === 'already-queued') {
    return <span className="text-xs text-muted-foreground">Already queued</span>
  }

  if (fundState === 'error') {
    return (
      <Button size="sm" variant="outline" onClick={() => setFundState('idle')}>
        Retry
      </Button>
    )
  }

  return (
    <>
      {KOFI_BASE && (
        <a
          href={`${KOFI_BASE}?utm_campaign=research&utm_content=${pairKey}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Publicly fund research for ${cropAName} & ${cropBName} via Ko-fi`}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted transition-colors"
        >
          Ko-fi
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {STRIPE_PK ? (
        <Button
          size="sm"
          onClick={handleClick}
          aria-label={`Fund research for ${cropAName} & ${cropBName}`}
        >
          Fund research
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled title="Payment provider not yet configured">
          Fund research
        </Button>
      )}

      {topUpOpen && (
        <TopUpModal
          onClose={() => setTopUpOpen(false)}
          onBalanceUpdate={cents => setBalanceCents(cents)}
        />
      )}
    </>
  )
}
