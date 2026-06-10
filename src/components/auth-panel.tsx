'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { signIn, signUp, signOut, useSession, authClient } from '@/lib/auth-client'

type Mode = 'signin' | 'signup' | 'forgot' | 'forgot-sent' | 'verify-sent'

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

  if (isPending) return null

  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-foreground">{session.user.name ?? session.user.email ?? ''}</span>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          {t('signOut')}
        </Button>
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
