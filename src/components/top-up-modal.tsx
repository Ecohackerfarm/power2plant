'use client'
import { useState, useEffect, useCallback } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
const MIN_TOPUP_CENTS = 200

function isEuTimezone(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz.startsWith('Europe/')
  } catch {
    return false
  }
}

import { clientEnv } from '@/lib/client-env'

const STRIPE_PK = clientEnv.stripePublishableKey()

const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null

const PRESETS = [
  { label: '€2', cents: 200 },
  { label: '€5', cents: 500 },
  { label: '€10', cents: 1000 },
]

function centsToEuros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

type CheckoutFormProps = {
  clientSecret: string
  amountCents: number
  onSuccess: (newBalanceCents: number) => void
  onBack: () => void
}

function CheckoutForm({ clientSecret, amountCents, onSuccess, onBack }: CheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        const res = await fetch('/api/credits/balance')
        const data = res.ok ? await res.json() : null
        onSuccess(data?.balanceCents ?? 0)
      } catch {
        onSuccess(0)
      }
    } else {
      setError('Payment could not be confirmed')
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Paying {centsToEuros(amountCents)}
      </p>
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={processing}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={!stripe || processing}>
          {processing ? 'Processing…' : `Pay ${centsToEuros(amountCents)}`}
        </Button>
      </div>
    </form>
  )
}

type Stage =
  | { type: 'pick' }
  | { type: 'checkout'; clientSecret: string; amountCents: number }
  | { type: 'success'; newBalanceCents: number; amountCents: number }

type Props = {
  onClose: () => void
  onBalanceUpdate?: (cents: number) => void
}

function ModalContent({ onClose, onBalanceUpdate }: Props) {
  const [stage, setStage] = useState<Stage>({ type: 'pick' })
  const [selectedCents, setSelectedCents] = useState<number>(PRESETS[0].cents)
  const [customEuros, setCustomEuros] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [loadingIntent, setLoadingIntent] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)

  const effectiveCents = useCustom
    ? Math.round(parseFloat(customEuros || '0') * 100)
    : selectedCents

  const isValidAmount = effectiveCents >= MIN_TOPUP_CENTS

  const handleProceed = useCallback(async () => {
    if (!isValidAmount) return
    setLoadingIntent(true)
    setIntentError(null)
    try {
      if (isEuTimezone()) {
        // Mollie redirect flow for EU; fall through to Stripe if Mollie not configured
        const mollieRes = await fetch('/api/mollie/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountCents: effectiveCents }),
        })
        if (mollieRes.ok) {
          const data = await mollieRes.json()
          window.location.href = data.checkoutUrl
          return
        }
        if (mollieRes.status !== 503) {
          const data = await mollieRes.json()
          throw new Error(data.error ?? 'Failed to create payment')
        }
        // 503 = provider not configured, fall through to Stripe
      }
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: effectiveCents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment')
      setStage({ type: 'checkout', clientSecret: data.clientSecret, amountCents: effectiveCents })
    } catch (err) {
      setIntentError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoadingIntent(false)
    }
  }, [isValidAmount, effectiveCents])

  function handleSuccess(newBalanceCents: number) {
    onBalanceUpdate?.(newBalanceCents)
    setStage({ type: 'success', newBalanceCents, amountCents: effectiveCents })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background text-foreground rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Top up balance</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {stage.type === 'pick' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.cents}
                  type="button"
                  onClick={() => { setSelectedCents(p.cents); setUseCustom(false) }}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
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
                  min={(MIN_TOPUP_CENTS / 100).toFixed(2)}
                  step="0.01"
                  placeholder="0.00"
                  value={customEuros}
                  onChange={e => { setCustomEuros(e.target.value); setUseCustom(true) }}
                  onFocus={() => setUseCustom(true)}
                  className="pl-6"
                />
              </div>
              {useCustom && !isValidAmount && customEuros !== '' && (
                <p className="text-xs text-destructive">Minimum top-up is {centsToEuros(MIN_TOPUP_CENTS)}</p>
              )}
            </div>

            {intentError && <p className="text-sm text-destructive">{intentError}</p>}

            <Button
              className="w-full"
              disabled={!isValidAmount || loadingIntent}
              onClick={handleProceed}
            >
              {loadingIntent ? 'Loading…' : `Continue with ${isValidAmount ? centsToEuros(effectiveCents) : '—'}`}
            </Button>
          </div>
        )}

        {stage.type === 'checkout' && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: stage.clientSecret, appearance: { theme: 'stripe' } }}
          >
            <CheckoutForm
              clientSecret={stage.clientSecret}
              amountCents={stage.amountCents}
              onSuccess={handleSuccess}
              onBack={() => setStage({ type: 'pick' })}
            />
          </Elements>
        )}

        {stage.type === 'success' && (
          <div className="space-y-4 text-center">
            <div className="text-4xl">✓</div>
            <p className="font-medium">Payment successful!</p>
            <p className="text-sm text-muted-foreground">
              Added {centsToEuros(stage.amountCents)} to your balance.
            </p>
            {stage.newBalanceCents > 0 && (
              <p className="text-sm">
                New balance: <span className="font-medium">{centsToEuros(stage.newBalanceCents)}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Invoice will be emailed to you.{' '}
              <a href="/account#billing" className="underline underline-offset-2" onClick={onClose}>
                Add billing address
              </a>{' '}
              for B2B invoices.
            </p>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function TopUpModal({ onClose, onBalanceUpdate }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return <ModalContent onClose={onClose} onBalanceUpdate={onBalanceUpdate} />
}
