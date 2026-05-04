'use client'
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/lib/auth-client'

interface Bed {
  id: string
  name: string
  plantings: Array<{ cropId: string; cropName: string }>
}

interface MyGardenRef {
  refresh: () => void
}

export const MyGarden = forwardRef<MyGardenRef>(function MyGarden(_, ref) {
  const { data: session } = useSession()
  const [beds, setBeds] = useState<Bed[]>([])
  const [loading, setLoading] = useState(false)

  const fetchBeds = async () => {
    if (!session) return
    setLoading(true)
    try {
      const res = await fetch('/api/garden/plantings')
      if (res.ok) {
        const data = await res.json()
        setBeds(data.beds)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchBeds()
  }, [session])

  useImperativeHandle(ref, () => ({
    refresh: fetchBeds,
  }))

  if (!session) return null

  if (loading) return <p>Loading...</p>

  if (beds.length === 0) return <p>No plan saved yet.</p>

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">My Garden</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {beds.map((bed) => (
          <Card key={bed.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{bed.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {bed.plantings.map((p) => (
                  <li key={p.cropId} className="text-sm">
                    {p.cropName}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
})