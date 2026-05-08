'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, confidenceLabel } from '@/lib/recommend'

type RelationshipRow = {
  relId: string; type: string; reason: string | null; reasons: string[]; confidence: number
  notes: string | null; direction: string
  cropAId: string; cropAName: string; cropABotanical: string; cropACommonNames: string[]
  cropANitrogen: boolean
  cropBId: string; cropBName: string; cropBBotanical: string; cropBCommonNames: string[]
  cropBNitrogen: boolean
}

type Source = {
  source: string; confidence: string; url: string | null; notes: string | null; fetchedAt: string
}

const REASON_LABELS: Record<string, string> = {
  PEST_CONTROL: 'Pest Control', POLLINATION: 'Pollination',
  NUTRIENT: 'Nutrient Sharing', SHADE: 'Shade Benefit',
  ALLELOPATHY: 'Natural Repellent',
}
const TYPE_LABELS: Record<string, string> = {
  COMPANION: 'Companion Planting', ATTRACTS: 'Attracts Beneficials',
  NURSE: 'Nurse Plant', TRAP_CROP: 'Trap Crop',
}
const DIRECTION_LABELS: Record<string, string> = {
  MUTUAL: 'Mutual (both plants benefit)',
  ONE_WAY: 'One-way',
  UNKNOWN: 'Direction unknown',
}

const SOURCE_LABELS: Record<string, string> = {
  TREFLE: 'Trefle', USDA: 'USDA', OPENFARM_DUMP: 'OpenFarm',
  PLANTBUDDIES: 'Plant Buddies', PFAF: 'Plants For A Future',
  WIKIDATA: 'Wikidata', GBIF: 'GBIF', COMMUNITY: 'Community', MANUAL: 'Manual',
}
const SOURCE_CONFIDENCE_LABELS: Record<string, string> = {
  ANECDOTAL: 'anecdotal', TRADITIONAL: 'traditional',
  OBSERVED: 'observed', PEER_REVIEWED: 'peer-reviewed',
}

function CropCard({ name, botanical, commonNames, isNitrogen }: {
  name: string; botanical: string; commonNames: string[]; isNitrogen: boolean
}) {
  const display = getDisplayName({ name, botanicalName: botanical, commonNames })
  return (
    <div>
      <p className="font-semibold text-lg">{display}</p>
      {display !== botanical && <p className="italic text-muted-foreground text-sm">{botanical}</p>}
      {isNitrogen && <Badge variant="secondary" className="mt-1 text-xs">Nitrogen Fixer</Badge>}
    </div>
  )
}

export default function RelationshipPage() {
  const { id, companionId } = useParams<{ id: string; companionId: string }>()
  const router = useRouter()
  const [rel, setRel] = useState<RelationshipRow | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/plants/${id}/companions/${companionId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ relationship, sources }) => { setRel(relationship); setSources(sources) })
      .finally(() => setLoading(false))
  }, [id, companionId])

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main>
  if (!rel) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-red-600">Relationship not found.</p></main>

  const clevel = confidenceLabel(rel.confidence)

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <CropCard
          name={rel.cropAName} botanical={rel.cropABotanical}
          commonNames={rel.cropACommonNames} isNitrogen={rel.cropANitrogen}
        />
        <span className="text-2xl text-muted-foreground">↔</span>
        <CropCard
          name={rel.cropBName} botanical={rel.cropBBotanical}
          commonNames={rel.cropBCommonNames} isNitrogen={rel.cropBNitrogen}
        />
      </div>

      <Separator />

      <dl className="space-y-3 text-sm">
        <div className="flex gap-3">
          <dt className="w-32 text-muted-foreground shrink-0">Relationship</dt>
          <dd className="font-medium">{TYPE_LABELS[rel.type] ?? rel.type}</dd>
        </div>
        {(rel.reasons?.length > 0 || rel.reason) && (
          <div className="flex gap-3">
            <dt className="w-32 text-muted-foreground shrink-0">
              {(rel.reasons?.length ?? 0) > 1 ? 'Reasons' : 'Reason'}
            </dt>
            <dd className="flex flex-wrap gap-1">
              {(rel.reasons?.length > 0 ? rel.reasons : [rel.reason!]).map(r => (
                <span key={r} className="inline-block bg-muted rounded px-2 py-0.5 text-xs">
                  {REASON_LABELS[r] ?? r}
                </span>
              ))}
            </dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-32 text-muted-foreground shrink-0">Direction</dt>
          <dd>{DIRECTION_LABELS[rel.direction] ?? rel.direction}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 text-muted-foreground shrink-0">Confidence</dt>
          <dd><ConfidenceBadge level={clevel} className="text-sm" /></dd>
        </div>
        {rel.notes && (
          <div className="flex gap-3">
            <dt className="w-32 text-muted-foreground shrink-0">Notes</dt>
            <dd className="text-muted-foreground">{rel.notes}</dd>
          </div>
        )}
      </dl>

      {sources.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="font-semibold mb-3 text-sm">Sources</h2>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="font-medium shrink-0">{SOURCE_LABELS[s.source] ?? s.source}</span>
                  <span className="text-muted-foreground">
                    — <ConfidenceBadge level={SOURCE_CONFIDENCE_LABELS[s.confidence] ?? s.confidence} />
                    {s.url && (
                      <> · <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">link</a></>
                    )}
                    {s.notes && <> · {s.notes}</>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </main>
  )
}
