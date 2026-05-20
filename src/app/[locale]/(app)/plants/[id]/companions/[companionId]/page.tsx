'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
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
  sourceType?: string | null
  urls?: Array<{ url: string; sourceType: string | null; confidence: string }>
}

function CropCard({ name, botanical, commonNames, isNitrogen, nitrogenLabel }: {
  name: string; botanical: string; commonNames: string[]; isNitrogen: boolean; nitrogenLabel: string
}) {
  const display = getDisplayName({ name, botanicalName: botanical, commonNames })
  return (
    <div>
      <p className="font-semibold text-lg">{display}</p>
      {display !== botanical && <p className="italic text-muted-foreground text-sm">{botanical}</p>}
      {isNitrogen && <Badge variant="secondary" className="mt-1 text-xs">{nitrogenLabel}</Badge>}
    </div>
  )
}

export default function RelationshipPage() {
  const t = useTranslations('RelationshipPage')
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

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-muted-foreground">{t('loading')}</p></main>
  if (!rel) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-red-600">{t('notFound')}</p></main>

  const clevel = confidenceLabel(rel.confidence)

  function translateKey(key: string, fallback?: string): string {
    try {
      return t(key as Parameters<typeof t>[0])
    } catch {
      return fallback ?? key
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <CropCard
          name={rel.cropAName} botanical={rel.cropABotanical}
          commonNames={rel.cropACommonNames} isNitrogen={rel.cropANitrogen}
          nitrogenLabel={t('nitrogenFixer')}
        />
        <span className="text-2xl text-muted-foreground">↔</span>
        <CropCard
          name={rel.cropBName} botanical={rel.cropBBotanical}
          commonNames={rel.cropBCommonNames} isNitrogen={rel.cropBNitrogen}
          nitrogenLabel={t('nitrogenFixer')}
        />
      </div>

      <Separator />

      <dl className="space-y-3 text-sm">
        <div className="flex gap-3">
          <dt className="w-32 text-muted-foreground shrink-0">{t('relationship')}</dt>
          <dd className="font-medium">{translateKey(rel.type, rel.type)}</dd>
        </div>
        {(rel.reasons?.length > 0 || rel.reason) && (
          <div className="flex gap-3">
            <dt className="w-32 text-muted-foreground shrink-0">
              {(rel.reasons?.length ?? 0) > 1 ? t('reasons') : t('reason')}
            </dt>
            <dd className="flex flex-wrap gap-1">
              {(rel.reasons?.length > 0 ? rel.reasons : [rel.reason!]).map(r => (
                <span key={r} className="inline-block bg-muted rounded px-2 py-0.5 text-xs">
                  {translateKey(r, r)}
                </span>
              ))}
            </dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-32 text-muted-foreground shrink-0">{t('direction')}</dt>
          <dd>{rel.direction === 'UNKNOWN' ? t('UNKNOWN_DIRECTION') : translateKey(rel.direction, rel.direction)}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 text-muted-foreground shrink-0">{t('confidence')}</dt>
          <dd><ConfidenceBadge level={clevel} className="text-sm" /></dd>
        </div>
        {rel.notes && (
          <div className="flex gap-3">
            <dt className="w-32 text-muted-foreground shrink-0">{t('notes')}</dt>
            <dd className="text-muted-foreground">{rel.notes}</dd>
          </div>
        )}
      </dl>

      {sources.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="font-semibold mb-3 text-sm">{t('sources')}</h2>
            <ul className="space-y-3">
              {sources.map((s, i) => {
                const sourceLabel = translateKey(s.source, s.source)
                const sourceConf = translateKey(s.confidence, s.confidence)
                if (s.source === 'COMMUNITY' && s.urls) {
                  return (
                    <li key={i} className="text-sm space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="font-medium shrink-0">{sourceLabel}</span>
                        <span className="text-muted-foreground">
                          — <ConfidenceBadge level={sourceConf} />
                          {s.notes && <> · {s.notes}</>}
                        </span>
                      </div>
                      {s.urls.length > 0 && (
                        <ul className="ml-4 space-y-1 border-l-2 border-muted pl-3">
                          {s.urls.map((u, j) => (
                            <li key={j} className="text-muted-foreground">
                              <a href={u.url} target="_blank" rel="noopener noreferrer" className="underline">
                                {u.url}
                              </a>
                              {u.sourceType && (
                                <span className="ml-1 text-xs bg-muted rounded px-1.5 py-0.5">
                                  {translateKey(u.sourceType, u.sourceType)}
                                </span>
                              )}
                              <span className="ml-1">
                                · <ConfidenceBadge level={translateKey(u.confidence, u.confidence)} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                }
                return (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="font-medium shrink-0">{sourceLabel}</span>
                    <span className="text-muted-foreground">
                      — <ConfidenceBadge level={sourceConf} />
                      {s.url && (
                        <> · <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{t('link')}</a></>
                      )}
                      {s.sourceType && (
                        <span className="ml-1 text-xs bg-muted rounded px-1.5 py-0.5">
                          {translateKey(s.sourceType, s.sourceType)}
                        </span>
                      )}
                      {s.notes && <> · {s.notes}</>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </main>
  )
}
