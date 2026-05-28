'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type AppConfig = {
  feedbackDigestEnabled: boolean
  feedbackDigestFreq: string
  feedbackDigestEmails: string[]
}

const FREQ_OPTIONS = ['daily', 'weekly', 'never']

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<'ok' | 'error' | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setConfig(data)
        setLoading(false)
      })
  }, [])

  function update(patch: Partial<AppConfig>) {
    setConfig(prev => prev ? { ...prev, ...patch } : prev)
    setDirty(true)
  }

  async function save() {
    if (!config) return
    setSaving(true)
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (res.ok) setDirty(false)
    setSaving(false)
  }

  async function sendTestEmail() {
    setTestingEmail(true)
    setTestEmailResult(null)
    const res = await fetch('/api/admin/config/test-email', { method: 'POST' })
    setTestEmailResult(res.ok ? 'ok' : 'error')
    setTestingEmail(false)
  }

  function addEmail() {
    const trimmed = emailInput.trim()
    if (!trimmed || !trimmed.includes('@')) return
    if (config?.feedbackDigestEmails.includes(trimmed)) return
    update({ feedbackDigestEmails: [...(config?.feedbackDigestEmails ?? []), trimmed] })
    setEmailInput('')
  }

  function removeEmail(email: string) {
    update({ feedbackDigestEmails: (config?.feedbackDigestEmails ?? []).filter(e => e !== email) })
  }

  const smtpEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>
  if (!config) return <p className="text-red-600 text-sm">Failed to load config.</p>

  return (
    <div className="space-y-8 max-w-xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Feedback digest</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.feedbackDigestEnabled}
            onChange={e => update({ feedbackDigestEnabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm">Enable feedback digest emails</span>
        </label>

        {config.feedbackDigestEnabled && (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium">Frequency</label>
              <div className="flex gap-2">
                {FREQ_OPTIONS.map(freq => (
                  <button
                    key={freq}
                    onClick={() => update({ feedbackDigestFreq: freq })}
                    className={`px-3 py-1 rounded text-sm border transition-colors ${
                      config.feedbackDigestFreq === freq
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Recipient emails</label>
              <div className="flex flex-wrap gap-1">
                {config.feedbackDigestEmails.map(email => (
                  <Badge key={email} variant="secondary" className="gap-1">
                    {email}
                    <button
                      onClick={() => removeEmail(email)}
                      className="ml-1 hover:text-destructive"
                      aria-label={`Remove ${email}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addEmail()}
                  placeholder="user@example.com"
                  className="flex-1 text-sm border rounded px-2 py-1"
                />
                <Button size="sm" variant="outline" onClick={addEmail}>Add</Button>
              </div>
            </div>
          </>
        )}

        <Button disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">SMTP</h2>
        <p className="text-sm text-muted-foreground">
          Configure via environment variables:
        </p>
        <div className="flex flex-wrap gap-1">
          {smtpEnvVars.map(v => (
            <code key={v} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{v}</code>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={testingEmail} onClick={sendTestEmail}>
            {testingEmail ? 'Sending…' : 'Send test email'}
          </Button>
          {testEmailResult === 'ok' && <span className="text-sm text-green-600">Sent successfully.</span>}
          {testEmailResult === 'error' && <span className="text-sm text-destructive">Failed — check SMTP env vars.</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Test email sends to all addresses in <code className="font-mono">ADMIN_EMAILS</code>.
        </p>
      </section>

    </div>
  )
}
