'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { getDisplayName, confidenceLabel } from '@/lib/recommend'
import { detectRank } from '@/lib/crop-rank'

type RelationshipRow = {
  relId: string; type: string; reasons: Array<{ type: string; explanation: string }>; confidence: number
  notes: string | null; direction: string
  cropAId: string; cropAName: string; cropABotanical: string; cropACommonNames: string[]
  cropANitrogen: boolean
  cropBId: string; cropBName: string; cropBBotanical: string; cropBCommonNames: string[]
  cropBNitrogen: boolean
  resolvedToGenus?: boolean
  genusA?: { id: string; botanicalName: string }
  genusB?: { id: string; botanicalName: string }
}

type Source = {
  source: string; confidence: string; url: string | null; notes: string | null; fetchedAt: string
  sourceType?: string | null
  position?: string | null
  urls?: Array<{ url: string; sourceType: string | null; confidence: string }>
}

type ResearchAttempt = {
  id: string; model: string; result: string; confidence: number | null; notes: string | null; attemptedAt: string
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
  const locale = useLocale()
  const { id, companionId } = useParams<{ id: string; companionId: string }>()
  const router = useRouter()
  const [rel, setRel] = useState<RelationshipRow | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [genusSources, setGenusSources] = useState<Source[]>([])
  const [researchAttempts, setResearchAttempts] = useState<ResearchAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/plants/${id}/companions/${companionId}?locale=${locale}`)
      .then(r => r.json().then(body => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok && !body.researchAttempts?.length) { setNotFound(true); return }
        setRel(body.relationship ?? null)
        setSources(body.sources ?? [])
        setGenusSources(body.genusSources ?? [])
        setResearchAttempts(body.researchAttempts ?? [])
        if (!body.relationship) setNotFound(false)
      })
      .finally(() => setLoading(false))
  }, [id, companionId])

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-muted-foreground">{t('loading')}</p></main>
  if (notFound) return <main className="max-w-3xl mx-auto px-4 py-8"><p className="text-red-600">{t('notFound')}</p></main>

  function translateKey(key: string, fallback?: string): string {
    try {
      return t(key as Parameters<typeof t>[0])
    } catch {
      return fallback ?? key
    }
  }

  if (!rel) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div><button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">{t('back')}</button></div>
        <p className="text-muted-foreground text-sm">{t('researchAttemptNoRelationship')}</p>
        <ResearchAttemptSection attempts={researchAttempts} expandedAttempt={expandedAttempt} setExpandedAttempt={setExpandedAttempt} translateKey={translateKey} t={t} />
      </main>
    )
  }

  const clevel = confidenceLabel(rel.confidence)
  const isDirectGenus = !rel.resolvedToGenus && detectRank(rel.cropABotanical) === 'genus'

  return (
    <main
      className="max-w-2xl mx-auto px-4 py-8 space-y-6"
      data-entity-type="relationship"
      data-entity-id={rel.relId}
    >
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
        </button>
      </div>

      {rel.resolvedToGenus && rel.genusA && rel.genusB && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {t('genusLevelBanner', {
            genusA: rel.genusA.botanicalName,
            genusB: rel.genusB.botanicalName,
            genus: rel.genusA.botanicalName,
          })}
        </div>
      )}

      {isDirectGenus && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {t('appliesToAllSpecies', { genus: rel.cropABotanical })}
        </div>
      )}

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
        <div className="flex gap-3" data-feedback-target="relationship:type">
          <dt className="w-32 text-muted-foreground shrink-0">{t('relationship')}</dt>
          <dd className="font-medium">{translateKey(rel.type, rel.type)}</dd>
        </div>
        {rel.reasons?.length > 0 && (
          <div className="flex gap-3" data-feedback-target="relationship:reason">
            <dt className="w-32 text-muted-foreground shrink-0">
              {rel.reasons.length > 1 ? t('reasons') : t('reason')}
            </dt>
            <dd className="space-y-1">
              {rel.reasons.map((r: { type: string; explanation: string }) => (
                <div key={r.type}>
                  <span className="inline-block bg-muted rounded px-2 py-0.5 text-xs mr-2">
                    {translateKey(r.type, r.type)}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.explanation}</span>
                </div>
              ))}
            </dd>
          </div>
        )}
        <div className="flex gap-3" data-feedback-target="relationship:direction">
          <dt className="w-32 text-muted-foreground shrink-0">{t('direction')}</dt>
          <dd>{rel.direction === 'UNKNOWN' ? t('UNKNOWN_DIRECTION') : translateKey(rel.direction, rel.direction)}</dd>
        </div>
        <div className="flex gap-3" data-feedback-target="relationship:confidence">
          <dt className="w-32 text-muted-foreground shrink-0">{t('confidence')}</dt>
          <dd><ConfidenceBadge level={clevel} className="text-sm" /></dd>
        </div>
        {rel.notes && (
          <div className="flex gap-3" data-feedback-target="relationship:notes">
            <dt className="w-32 text-muted-foreground shrink-0">{t('notes')}</dt>
            <dd className="text-muted-foreground">{rel.notes}</dd>
          </div>
        )}
      </dl>

      <ResearchAttemptSection attempts={researchAttempts} expandedAttempt={expandedAttempt} setExpandedAttempt={setExpandedAttempt} translateKey={translateKey} t={t} />

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
                    <li key={i} className="text-sm space-y-1" data-feedback-target={`relationship:source:${i}`}>
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
                              <a href={u.url.startsWith('http://') || u.url.startsWith('https://') ? u.url : '#'} target="_blank" rel="noopener noreferrer" className="underline">
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
                const positionDiffers = s.position && s.position !== rel.type
                return (
                  <li key={i} className="text-sm flex items-start gap-2" data-feedback-target={`relationship:source:${i}`}>
                    <span className="font-medium shrink-0">{sourceLabel}</span>
                    <span className="text-muted-foreground">
                      — <ConfidenceBadge level={sourceConf} />
                      {s.position && (
                        <span className={`ml-1 text-xs rounded px-1.5 py-0.5 font-medium ${
                          positionDiffers
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {translateKey(s.position, s.position)}
                        </span>
                      )}
                      {s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')) && (
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

      {genusSources.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">{t('genusLevelEvidence')}</h3>
            <ul className="space-y-3">
              {genusSources.map((s, i) => {
                const sourceLabel = translateKey(s.source, s.source)
                const sourceConf = translateKey(s.confidence, s.confidence)
                const isDerived = s.notes?.startsWith('Derived from')
                return (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="font-medium shrink-0">{sourceLabel}</span>
                    <span className="text-muted-foreground">
                      — <ConfidenceBadge level={sourceConf} />
                      {s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')) && (
                        <> · <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{t('link')}</a></>
                      )}
                      {s.sourceType && (
                        <span className="ml-1 text-xs bg-muted rounded px-1.5 py-0.5">
                          {translateKey(s.sourceType, s.sourceType)}
                        </span>
                      )}
                      {s.notes && <> · <span className={isDerived ? 'italic' : ''}>{s.notes}</span></>}
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

function ResearchAttemptSection({ attempts, expandedAttempt, setExpandedAttempt, translateKey, t }: {
  attempts: ResearchAttempt[]
  expandedAttempt: string | null
  setExpandedAttempt: (id: string | null) => void
  translateKey: (key: string, fallback?: string) => string
  t: ReturnType<typeof useTranslations<'RelationshipPage'>>
}) {
  if (attempts.length === 0) return null
  return (
    <>
      <Separator />
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium bg-amber-100 text-amber-800 rounded px-2 py-0.5">
            {t('researchAttemptedTitle')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{t('researchAttemptedHint')}</p>
        <ul className="space-y-2">
          {attempts.map(a => (
            <li key={a.id} className="text-xs">
              <button
                onClick={() => setExpandedAttempt(expandedAttempt === a.id ? null : a.id)}
                className="flex items-center gap-2 text-left hover:text-foreground text-muted-foreground w-full"
              >
                <span className="font-medium">{translateKey(a.result, a.result)}</span>
                <span>·</span>
                <span>{new Date(a.attemptedAt).toLocaleDateString()}</span>
                <span className="ml-auto">{expandedAttempt === a.id ? '▲' : '▼'}</span>
              </button>
              {expandedAttempt === a.id && (
                <dl className="mt-2 ml-2 space-y-1 border-l-2 border-muted pl-3 text-muted-foreground">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0">{t('researchAttemptModel')}</dt>
                    <dd className="font-mono text-xs break-all">{a.model}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0">{t('researchAttemptDate')}</dt>
                    <dd>{new Date(a.attemptedAt).toLocaleString()}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0">{t('researchAttemptResult')}</dt>
                    <dd>{translateKey(a.result, a.result)}{a.confidence != null && ` (${(a.confidence * 100).toFixed(0)}%)`}</dd>
                  </div>
                  {a.notes && (
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0">{t('researchAttemptNotes')}</dt>
                      <dd>{a.notes}</dd>
                    </div>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
