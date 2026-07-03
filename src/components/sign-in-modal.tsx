'use client'
import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import { signIn, signUp, authClient } from '@/lib/auth-client'

type Mode = 'signin' | 'signup' | 'forgot' | 'forgot-sent' | 'verify-sent'

type Props = {
  onClose: () => void
  onSuccess?: () => void
}

export function SignInModal({ onClose, onSuccess }: Props) {
  const t = useTranslations('Auth')
  const locale = useLocale()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDone, setResendDone] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function reset(nextMode: Mode) {
    setMode(nextMode)
    setError(null)
    setResendDone(false)
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
      onSuccess?.()
      onClose()
      // Re-run server components so session-dependent UI (e.g. admin nav) updates without a manual reload.
      router.refresh()
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{cardTitle()}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

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
              onClick={() => reset('signin')}
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
              onClick={() => reset('signin')}
            >
              {t('backToSignIn')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1">
                <Label htmlFor="signin-modal-name">{t('name')}</Label>
                <Input
                  id="signin-modal-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="signin-modal-email">{t('email')}</Label>
              <Input
                id="signin-modal-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== 'forgot' && (
              <div className="space-y-1">
                <Label htmlFor="signin-modal-password">{t('password')}</Label>
                <Input
                  id="signin-modal-password"
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
              onClick={onClose}
            >
              {t('cancel')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
