'use client'
import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type FeedbackItem = {
  id: string
  mode: 'DATA' | 'OTHER'
  pageUrl: string
  entityType: string | null
  entityId: string | null
  targetKey: string | null
  screenshot: string | null
  message: string
  ipHash: string
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED'
  createdAt: string
  resolvedAt: string | null
  resolvedNote: string | null
}

function StatusBadge({ status }: { status: FeedbackItem['status'] }) {
  if (status === 'OPEN') return <Badge variant="destructive">Open</Badge>
  if (status === 'RESOLVED') return <Badge variant="default">Resolved</Badge>
  return <Badge variant="secondary">Dismissed</Badge>
}

function ModeBadge({ mode }: { mode: FeedbackItem['mode'] }) {
  return <Badge variant="outline">{mode === 'DATA' ? 'Data' : 'Other'}</Badge>
}

function formatTargetKey(key: string | null): string {
  if (!key) return '—'
  const parts = key.split(':')
  const entity = parts[0]
  const field = parts[1]
  const sub = parts[2]
  if (!field) return key
  const label = field.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  if (field === 'source' && sub !== undefined) {
    const idx = parseInt(sub)
    return `${entity} · Source ${isNaN(idx) ? sub : idx + 1}`
  }
  return `${entity} · ${label}`
}

function ScreenshotThumb({ src }: { src: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <img
        src={src}
        alt="screenshot"
        className="w-16 h-10 object-cover rounded cursor-pointer border hover:opacity-80"
        onClick={() => setExpanded(true)}
      />
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <img src={src} alt="screenshot" className="max-w-full max-h-full rounded shadow-lg" />
        </div>
      )}
    </div>
  )
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('OPEN')
  const [modeFilter, setModeFilter] = useState<string>('ALL')
  const [actioning, setActioning] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState<Record<string, string>>({})

  const limit = 20

  const fetchItems = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (modeFilter !== 'ALL') params.set('mode', modeFilter)
      const res = await fetch(`/api/admin/feedback?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter, modeFilter])

  useEffect(() => {
    setPage(1)
    fetchItems(1)
  }, [fetchItems])

  async function action(id: string, status: 'RESOLVED' | 'DISMISSED') {
    setActioning(id)
    const body: Record<string, string> = { status }
    if (status === 'RESOLVED' && resolveNote[id]) body.resolvedNote = resolveNote[id]
    const res = await fetch(`/api/admin/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setItems(prev => prev.map(it => it.id === id ? { ...it, status } : it))
    }
    setActioning(null)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Feedback</h1>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
            <option value="ALL">All statuses</option>
          </select>
          <select
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="ALL">All modes</option>
            <option value="DATA">Data</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No feedback found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Mode</th>
                <th className="py-2 pr-3 font-medium">Page</th>
                <th className="py-2 pr-3 font-medium">Target</th>
                <th className="py-2 pr-3 font-medium">Message</th>
                <th className="py-2 pr-3 font-medium">Screenshot</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b hover:bg-muted/30 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3"><ModeBadge mode={item.mode} /></td>
                  <td className="py-2 pr-3 max-w-[140px]">
                    <span className="truncate block text-xs font-mono" title={item.pageUrl}>{item.pageUrl}</span>
                  </td>
                  <td className="py-2 pr-3 max-w-[140px]">
                    <span className="truncate block text-xs text-muted-foreground" title={item.targetKey ?? ''}>{formatTargetKey(item.targetKey)}</span>
                  </td>
                  <td className="py-2 pr-3 max-w-[200px]">
                    <p className="line-clamp-2 text-xs">{item.message}</p>
                  </td>
                  <td className="py-2 pr-3">
                    {item.screenshot ? <ScreenshotThumb src={item.screenshot} /> : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="py-2 pr-3"><StatusBadge status={item.status} /></td>
                  <td className="py-2">
                    {item.status === 'OPEN' && (
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1 items-center">
                          <input
                            className="text-xs border rounded px-1 py-0.5 w-28"
                            placeholder="Note (optional)"
                            value={resolveNote[item.id] ?? ''}
                            onChange={e => setResolveNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={actioning === item.id}
                            onClick={() => action(item.id, 'RESOLVED')}
                            className="text-xs h-7"
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actioning === item.id}
                            onClick={() => action(item.id, 'DISMISSED')}
                            className="text-xs h-7"
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                    {item.resolvedNote && (
                      <p className="text-xs text-muted-foreground mt-1">{item.resolvedNote}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); void fetchItems(next) }}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { const next = page + 1; setPage(next); void fetchItems(next) }}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
