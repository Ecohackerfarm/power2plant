'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { signIn, signUp, signOut, useSession, authClient } from '@/lib/auth-client'
import { TopUpModal } from '@/components/top-up-modal'

type Mode = 'signin' | 'signup' | 'forgot' | 'forgot-sent' | 'verify-sent'

function centsToEuros(cents: number) {
  return `€${(cents / 100).toFixed(2)}`
}

export function AuthPanel() {
  const t = useTranslations('Auth')
  const locale = useLocale()
  const { data: session, isPending } = useSession()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDone, setResendDone] = useState(false)

  // User menu state
  const [menuOpen, setMenuOpen] = useState(false)
  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [topUpOpen, setTopUpOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchBalance = useCallback(async () => {
    const res = await fetch('/api/credits/balance').catch(() => null)
    if (res?.ok) {
      const d = await res.json()
      setBalanceCents(d.balanceCents)
    }
  }, [])

  useEffect(() => {
    if (session) fetchBalance()
  }, [session, fetchBalance])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  if (isPending) return null

  if (session) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="User menu"
        >
          <User size={16} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-background border rounded-xl shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-medium text-foreground truncate">{session.user.name ?? session.user.email}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </div>

            <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
              <span className="text-sm tabular-nums text-muted-foreground">
                {balanceCents === null ? '…' : centsToEuros(balanceCents)}
              </span>
              <Button
                size="sm"
                onClick={() => { setMenuOpen(false); setTopUpOpen(true) }}
              >
                Top up
              </Button>
            </div>

            <div className="py-1">
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                Account settings
              </Link>
              <button
                onClick={() => { setMenuOpen(false); signOut() }}
                className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                {t('signOut')}
              </button>
            </div>
          </div>
        )}

        {topUpOpen && (
          <TopUpModal
            onClose={() => setTopUpOpen(false)}
            onBalanceUpdate={cents => setBalanceCents(cents)}
          />
        )}
      </div>
    )
  }

  function reset(nextMode: Mode) {
    setMode(nextMode)
    setError(null)
    setResendDone(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        const result = await signUp.email({ name, email, password })
        if (result.error) throw new Error(result.error.message ?? 'Sign up failed')
        setMode('verify-sent')
        return
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `/${locale}/reset-password`,
        })
        if (result.error) throw new Error(result.error.message ?? 'Failed to send reset email')
        setMode('forgot-sent')
        return
      } else {
        const result = await signIn.email({ email, password })
        if (result.error) throw new Error(result.error.message ?? 'Sign in failed')
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResendLoading(true)
    try {
      await authClient.sendVerificationEmail({ email })
      setResendDone(true)
    } catch {
      // silent — user can retry
    } finally {
      setResendLoading(false)
    }
  }

  function cardTitle() {
    switch (mode) {
      case 'verify-sent': return t('checkYourEmail')
      case 'forgot': return t('resetPasswordTitle')
      case 'forgot-sent': return t('checkYourEmail')
      case 'signup': return t('createAccount')
      default: return t('signIn')
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)}>
        {t('signInToSave')}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50">
          <Card className="w-80 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{cardTitle()}</CardTitle>
            </CardHeader>
            <CardContent>
              {mode === 'verify-sent' ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t('verifyEmailSent')}</p>
                  {resendDone ? (
                    <p className="text-sm text-green-600">{t('verificationResent')}</p>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={resendLoading}
                      onClick={handleResendVerification}
                    >
                      {resendLoading ? t('pleaseWait') : t('resendVerification')}
                    </Button>
                  )}
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => { reset('signin'); setOpen(false) }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              ) : mode === 'forgot-sent' ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t('resetLinkSent')}</p>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => { reset('signin'); setOpen(false) }}
                  >
                    {t('backToSignIn')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  {mode === 'signup' && (
                    <div className="space-y-1">
                      <Label htmlFor="auth-name">{t('name')}</Label>
                      <Input
                        id="auth-name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="auth-email">{t('email')}</Label>
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  {mode !== 'forgot' && (
                    <div className="space-y-1">
                      <Label htmlFor="auth-password">{t('password')}</Label>
                      <Input
                        id="auth-password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                    </div>
                  )}
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading
                      ? t('pleaseWait')
                      : mode === 'forgot'
                        ? t('sendResetLink')
                        : mode === 'signup'
                          ? t('createAccount')
                          : t('signIn')}
                  </Button>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                      onClick={() => reset('forgot')}
                    >
                      {t('forgotPassword')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => {
                      if (mode === 'forgot') { reset('signin'); return }
                      reset(mode === 'signin' ? 'signup' : 'signin')
                    }}
                  >
                    {mode === 'signin' ? t('noAccount') : mode === 'forgot' ? t('backToSignIn') : t('haveAccount')}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => setOpen(false)}
                  >
                    {t('cancel')}
                  </button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
