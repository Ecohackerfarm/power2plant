// design-sync mock backend for the feature components.
//
// PlantSearch fetches `/api/crops` live; there is no backend in the claude.ai/
// design sandbox, so we wrap window.fetch and answer `/api/*` from a small seed
// dataset, passing every other URL through to the real fetch untouched. This is
// imported for its side effect from the feature-export wrapper so it installs
// before any component mounts. Production still hits the real /api/crops — this
// only stands in for the demo render (documented in PlantSearch.prompt.md).
//
// This module is the FIRST import in feature-exports.tsx, so esbuild evaluates
// it before next-intl. next-intl reads a bare `process` at module load; the
// converter's esbuild only substitutes `process.env.NODE_ENV`, so without a
// polyfill the whole IIFE throws "process is not defined" and no exports bind.
// Polyfill it here before any other module is evaluated.
{
  const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } }
  if (!g.process) g.process = { env: { NODE_ENV: 'development' } }
}

type Crop = {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
  isCommonCrop: boolean
  commonNames: string[]
  rank: 'genus' | 'species'
}

const CROPS: Crop[] = [
  { id: 'tomato', name: 'tomato', botanicalName: 'Solanum lycopersicum', minTempC: 10, isCommonCrop: true, commonNames: ['tomato'], rank: 'species' },
  { id: 'basil', name: 'basil', botanicalName: 'Ocimum basilicum', minTempC: 12, isCommonCrop: true, commonNames: ['basil', 'sweet basil'], rank: 'species' },
  { id: 'ocimum', name: 'basil (genus)', botanicalName: 'Ocimum L.', minTempC: 12, isCommonCrop: false, commonNames: [], rank: 'genus' },
  { id: 'carrot', name: 'carrot', botanicalName: 'Daucus carota', minTempC: 4, isCommonCrop: true, commonNames: ['carrot'], rank: 'species' },
  { id: 'lettuce', name: 'lettuce', botanicalName: 'Lactuca sativa', minTempC: 4, isCommonCrop: true, commonNames: ['lettuce'], rank: 'species' },
  { id: 'marigold', name: 'marigold', botanicalName: 'Tagetes patula', minTempC: 8, isCommonCrop: true, commonNames: ['french marigold', 'marigold'], rank: 'species' },
  { id: 'bean', name: 'bush bean', botanicalName: 'Phaseolus vulgaris', minTempC: 10, isCommonCrop: true, commonNames: ['bush bean', 'green bean'], rank: 'species' },
  { id: 'sunflower', name: 'sunflower', botanicalName: 'Helianthus annuus', minTempC: 8, isCommonCrop: true, commonNames: ['sunflower'], rank: 'species' },
  { id: 'nasturtium', name: 'nasturtium', botanicalName: 'Tropaeolum majus', minTempC: 8, isCommonCrop: true, commonNames: ['nasturtium'], rank: 'species' },
  { id: 'onion', name: 'onion', botanicalName: 'Allium cepa', minTempC: 2, isCommonCrop: true, commonNames: ['onion'], rank: 'species' },
  { id: 'cucumber', name: 'cucumber', botanicalName: 'Cucumis sativus', minTempC: 12, isCommonCrop: true, commonNames: ['cucumber'], rank: 'species' },
  { id: 'pepper', name: 'pepper', botanicalName: 'Capsicum annuum', minTempC: 12, isCommonCrop: true, commonNames: ['pepper', 'bell pepper'], rank: 'species' },
  { id: 'borage', name: 'borage', botanicalName: 'Borago officinalis', minTempC: 6, isCommonCrop: true, commonNames: ['borage'], rank: 'species' },
  { id: 'dill', name: 'dill', botanicalName: 'Anethum graveolens', minTempC: 6, isCommonCrop: true, commonNames: ['dill'], rank: 'species' },
]

function matches(crop: Crop, q: string): boolean {
  const ql = q.toLowerCase()
  return (
    crop.name.toLowerCase().includes(ql) ||
    crop.botanicalName.toLowerCase().includes(ql) ||
    crop.commonNames.some((c) => c.toLowerCase().includes(ql))
  )
}

function handle(url: URL): unknown | undefined {
  if (!url.pathname.startsWith('/api/')) return undefined
  if (url.pathname === '/api/crops') {
    const ids = url.searchParams.get('ids')
    if (ids) {
      const set = new Set(ids.split(','))
      return { crops: CROPS.filter((c) => set.has(c.id)) }
    }
    const q = (url.searchParams.get('q') ?? '').trim()
    if (q.length < 2) return { crops: [] }
    return { crops: CROPS.filter((c) => matches(c, q)).slice(0, 8) }
  }
  // garden save endpoints etc. — acknowledge writes so the UI completes.
  return { ok: true }
}

declare const globalThis: { fetch?: typeof fetch } & Record<string, unknown>

if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
  const real = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      const url = new URL(raw, 'http://design.local')
      const body = handle(url)
      if (body !== undefined) {
        return Promise.resolve(
          new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        )
      }
    } catch {
      /* fall through to real fetch */
    }
    return real(input as RequestInfo | URL, init)
  }) as typeof fetch
}
