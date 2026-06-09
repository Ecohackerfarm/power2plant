'use client'
import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

function ResetPasswordForm() {
  const t = useTranslations('Auth')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-red-600">{t('invalidResetToken')}</p>
        </CardContent>
      </Card>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: token! })
      if (result.error) throw new Error(result.error.message ?? 'Reset failed')
      setDone(true)
      setTimeout(() => router.push('/'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invalidResetToken'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-base">{t('resetPasswordTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-green-600">{t('passwordResetSuccess')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-password">{t('newPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('pleaseWait') : t('setPassword')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
