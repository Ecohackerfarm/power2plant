'use client'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResearchFundButton } from '@/components/research-fund-button'
import { getDisplayName } from '@/lib/recommend'

type Crop = { id: string; name: string; botanicalName: string; commonNames: string[] }

type ResearchRequestItem = {
  id: string
  cropAId: string
  cropBId: string
  voteCount: number
  funded: boolean
  createdAt: string
  cropA: Crop
  cropB: Crop
  _count: { votes: number }
}

export default function AdminResearchRequestsPage() {
  const [items, setItems] = useState<ResearchRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/research-requests')
      .then(r => r.ok ? r.json() : [])
      .then((data: ResearchRequestItem[]) => {
        setItems(data)
      })
      .finally(() => setLoading(false))
  }, [])

  async function toggleFunded(item: ResearchRequestItem) {
    setToggling(item.id)
    const res = await fetch('/api/admin/research-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, funded: !item.funded }),
    })
    if (res.ok) {
      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, funded: !i.funded } : i)
      )
    }
    setToggling(null)
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Research Requests</h1>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No research requests yet.</p>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map(item => {
            const nameA = getDisplayName(item.cropA)
            const nameB = getDisplayName(item.cropB)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 border rounded-md px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {nameA} &amp; {nameB}
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    {item.cropA.botanicalName} × {item.cropB.botanicalName}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="secondary">{item.voteCount} vote{item.voteCount !== 1 ? 's' : ''}</Badge>
                  {item.funded && <Badge variant="default">Funded</Badge>}
                  <ResearchFundButton cropAName={nameA} cropBName={nameB} cropAId={item.cropAId} cropBId={item.cropBId} />
                  <Button
                    size="sm"
                    variant={item.funded ? 'outline' : 'secondary'}
                    disabled={toggling === item.id}
                    onClick={() => toggleFunded(item)}
                  >
                    {item.funded ? 'Unmark funded' : 'Mark funded'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
