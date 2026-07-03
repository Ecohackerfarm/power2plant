'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useSearchParams } from 'next/navigation'

const MIN_CENTS = 100
const PRESETS = [
  { label: '€2', cents: 200 },
  { label: '€5', cents: 500 },
  { label: '€10', cents: 1000 },
  { label: '€20', cents: 2000 },
]

export default function DonatePage() {
  const searchParams = useSearchParams()
  const success = searchParams.get('mollie') === 'success'

  const [selectedCents, setSelectedCents] = useState(PRESETS[1].cents)
  const [customEuros, setCustomEuros] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveCents = useCustom ? Math.round(parseFloat(customEuros || '0') * 100) : selectedCents
  const isValid = effectiveCents >= MIN_CENTS

  async function handleDonate() {
    if (!isValid) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mollie/create-donation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: effectiveCents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start donation')
      window.location.href = data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-5xl">🌱</div>
        <h1 className="text-2xl font-bold">Thank you!</h1>
        <p className="text-muted-foreground">
          Your donation has been added to the research pot. It will fund the next top-voted crop pair.
        </p>
        <a href="/research-requests" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">View research requests</a>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Donate to the research pot</h1>
        <p className="text-sm text-muted-foreground">
          Donations fund companion planting research for the community. Each pot top-up triggers a research job for the most-voted crop pair.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map(p => (
              <button
                key={p.cents}
                type="button"
                onClick={() => { setSelectedCents(p.cents); setUseCustom(false) }}
                className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                  !useCustom && selectedCents === p.cents
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Custom amount</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
              <Input
                type="number"
                min="1.00"
                step="0.01"
                placeholder="0.00"
                value={customEuros}
                onChange={e => { setCustomEuros(e.target.value); setUseCustom(true) }}
                onFocus={() => setUseCustom(true)}
                className="pl-6"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" disabled={!isValid || loading} onClick={handleDonate}>
            {loading ? 'Redirecting…' : `Donate €${(effectiveCents / 100).toFixed(2)}`}
          </Button>
          <p className="text-xs text-muted-foreground text-center">Powered by Mollie · iDEAL, Bancontact, SEPA &amp; more</p>
        </CardContent>
      </Card>
    </div>
  )
}
