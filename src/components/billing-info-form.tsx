'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BillingInfo {
  companyName?: string | null
  street: string
  city: string
  zip: string
  country: string
  vatId?: string | null
}

export function BillingInfoForm() {
  const [info, setInfo] = useState<BillingInfo>({ street: '', city: '', zip: '', country: 'DE' })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | 'vat_invalid' | null>(null)

  useEffect(() => {
    fetch('/api/billing')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.billingInfo) setInfo(d.billingInfo)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  function set(field: keyof BillingInfo, value: string) {
    setInfo(prev => ({ ...prev, [field]: value }))
    setResult(null)
  }

  async function save() {
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch('/api/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      })
      if (res.status === 422) {
        setResult('vat_invalid')
      } else if (res.ok) {
        setResult('ok')
      } else {
        setResult('error')
      }
    } catch {
      setResult('error')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>

  const isB2B = !!(info.vatId?.trim())

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Used on your invoices. Required for B2B — include your VAT ID to get a{' '}
        ZUGFeRD-compliant invoice with reverse charge where applicable.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="bill-company">Company name <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="bill-company"
            value={info.companyName ?? ''}
            onChange={e => set('companyName', e.target.value)}
            placeholder="Acme GmbH"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="bill-street">Street and number</Label>
          <Input
            id="bill-street"
            value={info.street}
            onChange={e => set('street', e.target.value)}
            placeholder="Musterstraße 1"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="bill-zip">Postcode</Label>
          <Input
            id="bill-zip"
            value={info.zip}
            onChange={e => set('zip', e.target.value)}
            placeholder="10115"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="bill-city">City</Label>
          <Input
            id="bill-city"
            value={info.city}
            onChange={e => set('city', e.target.value)}
            placeholder="Berlin"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="bill-country">Country code</Label>
          <Input
            id="bill-country"
            value={info.country}
            onChange={e => set('country', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="DE"
            maxLength={2}
            className="uppercase"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="bill-vat">
            VAT ID <span className="text-muted-foreground">(optional — signals B2B)</span>
          </Label>
          <Input
            id="bill-vat"
            value={info.vatId ?? ''}
            onChange={e => set('vatId', e.target.value)}
            placeholder="DE123456789"
            className="uppercase"
          />
        </div>
      </div>

      {isB2B && (
        <p className="text-xs text-muted-foreground">
          B2B invoice with ZUGFeRD XML. EU customers outside Germany get reverse charge applied automatically.
        </p>
      )}

      {result === 'vat_invalid' && (
        <p className="text-sm text-destructive">VAT ID format is invalid. Check the country prefix and number.</p>
      )}
      {result === 'error' && (
        <p className="text-sm text-destructive">Failed to save — please try again.</p>
      )}
      {result === 'ok' && (
        <p className="text-sm text-green-600">Saved.</p>
      )}

      <Button
        onClick={save}
        disabled={saving || !info.street.trim() || !info.city.trim() || !info.zip.trim() || !info.country.trim()}
      >
        {saving ? 'Saving…' : 'Save billing info'}
      </Button>
    </div>
  )
}
