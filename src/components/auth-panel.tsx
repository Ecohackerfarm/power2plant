'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { signIn, signUp, signOut, useSession } from '@/lib/auth-client'

type Mode = 'signin' | 'signup'

export function AuthPanel() {
  const t = useTranslations('Auth')
  const { data: session, isPending } = useSession()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  if (isPending) return null

  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{session.user.email ?? ''}</span>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          {t('signOut')}
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        const result = await signUp.email({ name, email, password })
        if (result.error) throw new Error(result.error.message ?? 'Sign up failed')
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

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t('signInToSave')}
      </Button>
    )
  }

  return (
    <Card className="w-80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {mode === 'signin' ? t('signIn') : t('createAccount')}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('pleaseWait') : mode === 'signin' ? t('signIn') : t('createAccount')}
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
          >
            {mode === 'signin' ? t('noAccount') : t('haveAccount')}
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => setOpen(false)}
          >
            {t('cancel')}
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
