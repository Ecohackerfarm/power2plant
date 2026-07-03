'use client'
import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useSession, authClient, signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TopUpModal } from '@/components/top-up-modal'
import { BillingInfoForm } from '@/components/billing-info-form'

function centsToEuros(cents: number) {
  return `€${(cents / 100).toFixed(2)}`
}

export default function AccountPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const locale = useLocale()

  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameResult, setNameResult] = useState<'ok' | 'error' | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState<'sent' | 'error' | null>(null)

  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [topUpOpen, setTopUpOpen] = useState(false)

  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && !session) router.push('/')
  }, [isPending, session, router])

  useEffect(() => {
    if (session) {
      setName(session.user.name ?? '')
      fetch('/api/credits/balance')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setBalanceCents(d.balanceCents) })
    }
  }, [session])

  async function saveName() {
    setNameSaving(true)
    setNameResult(null)
    const { error } = await authClient.updateUser({ name })
    setNameResult(error ? 'error' : 'ok')
    setNameSaving(false)
  }

  async function requestEmailChange() {
    if (!newEmail.trim()) return
    setEmailSending(true)
    setEmailResult(null)
    const { error } = await authClient.changeEmail({
      newEmail: newEmail.trim(),
      callbackURL: `/${locale}/account`,
    })
    setEmailResult(error ? 'error' : 'sent')
    setEmailSending(false)
  }

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error ?? 'Failed to delete account')
        setDeleting(false)
        return
      }
      await signOut()
      router.push('/')
    } catch {
      setDeleteError('Something went wrong')
      setDeleting(false)
    }
  }

  if (isPending || !session) return null

  const canDelete = confirmEmail.trim().toLowerCase() === session.user.email.toLowerCase()

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-10">
      <h1 className="text-2xl font-bold">Account</h1>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Display name</h2>
        <div className="space-y-1">
          <Label htmlFor="acc-name">Name</Label>
          <Input
            id="acc-name"
            value={name}
            onChange={e => { setName(e.target.value); setNameResult(null) }}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={saveName} disabled={nameSaving || !name.trim()}>
            {nameSaving ? 'Saving…' : 'Save name'}
          </Button>
          {nameResult === 'ok' && <span className="text-sm text-green-600">Saved.</span>}
          {nameResult === 'error' && <span className="text-sm text-destructive">Failed to save.</span>}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Email address</h2>
        <p className="text-sm text-muted-foreground">Current: <span className="text-foreground">{session.user.email}</span></p>
        <div className="space-y-1">
          <Label htmlFor="acc-email">New email address</Label>
          <Input
            id="acc-email"
            type="email"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setEmailResult(null) }}
            placeholder="new@example.com"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={requestEmailChange} disabled={emailSending || !newEmail.trim()} variant="outline">
            {emailSending ? 'Sending…' : 'Request email change'}
          </Button>
          {emailResult === 'sent' && <span className="text-sm text-green-600">Check your new email for a verification link.</span>}
          {emailResult === 'error' && <span className="text-sm text-destructive">Failed — check the address and try again.</span>}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Balance</h2>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-mono tabular-nums">
            {balanceCents === null ? '…' : centsToEuros(balanceCents)}
          </span>
          <Button variant="outline" onClick={() => setTopUpOpen(true)}>Top up</Button>
        </div>
        {topUpOpen && (
          <TopUpModal
            onClose={() => setTopUpOpen(false)}
            onBalanceUpdate={cents => setBalanceCents(cents)}
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Billing info</h2>
        <BillingInfoForm />
      </section>

      <section className="space-y-4 border border-destructive/40 rounded-lg p-5">
        <h2 className="font-semibold text-lg text-destructive">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          This permanently deletes your account, garden data, and research history. It cannot be undone.
        </p>
        {balanceCents !== null && balanceCents > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Your remaining balance of <strong>{centsToEuros(balanceCents)}</strong> will be donated to fund community research.
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="acc-confirm-email">Type your email to confirm</Label>
          <Input
            id="acc-confirm-email"
            type="email"
            value={confirmEmail}
            onChange={e => { setConfirmEmail(e.target.value); setDeleteError(null) }}
            placeholder={session.user.email}
          />
        </div>
        {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
        <Button
          variant="destructive"
          disabled={!canDelete || deleting}
          onClick={deleteAccount}
        >
          {deleting ? 'Deleting…' : 'Delete my account'}
        </Button>
      </section>
    </div>
  )
}
