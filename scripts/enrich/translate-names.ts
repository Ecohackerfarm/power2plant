/**
 * Enrich CropTranslation table with vernacular names from Wikidata (primary)
 * and GBIF (gap-fill).
 *
 * Usage:
 *   pnpm enrich:translate-names                  # de via wikidata+gbif
 *   pnpm enrich:translate-names --locale de
 *   pnpm enrich:translate-names --locale de --source wikidata
 *   pnpm enrich:translate-names --locale de --source gbif
 *   pnpm enrich:translate-names --locale es --source wikidata
 *
 * Idempotent: skips crops that already have a translation for the locale.
 * Use --force to re-fetch and overwrite existing translations.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const GBIF_API = 'https://api.gbif.org/v1'
const USER_AGENT = 'power2plant/0.12 (https://github.com/Ecohackerfarm/power2plant; mailto:admin@power2plant.app)'

const WIKIDATA_BATCH = 50   // taxa per SPARQL query
const GBIF_DELAY_MS  = 500  // GBIF rate-limit headroom
const WD_DELAY_MS    = 1500 // Wikidata polite crawl delay between batches
const WD_RETRY_WAIT  = 10000 // wait after 429 before retry

// BCP-47 locale → ISO 639-2 (Wikidata lang code) + GBIF language string
const LOCALE_MAP: Record<string, { wikidata: string; gbif: string }> = {
  de: { wikidata: 'de', gbif: 'GERMAN' },
  es: { wikidata: 'es', gbif: 'SPANISH' },
  fr: { wikidata: 'fr', gbif: 'FRENCH' },
  pt: { wikidata: 'pt', gbif: 'PORTUGUESE' },
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Wikidata ──────────────────────────────────────────────────────────────────

interface WikidataResult {
  results: {
    bindings: Array<{
      botanical: { value: string }
      name:      { value: string }
    }>
  }
}

async function fetchWikidataBatch(
  botanicalNames: string[],
  lang: string,
): Promise<Map<string, string[]>> {
  const values = botanicalNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(' ')
  const query = `
    SELECT ?botanical ?name WHERE {
      VALUES ?botanical { ${values} }
      ?taxon wdt:P225 ?botanical .
      ?taxon wdt:P1843 ?name .
      FILTER(LANG(?name) = "${lang}")
    }
  `
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`
  let res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json' },
  })
  if (res.status === 429) {
    process.stdout.write(`  [429] backing off ${WD_RETRY_WAIT / 1000}s... `)
    await sleep(WD_RETRY_WAIT)
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json' },
    })
  }
  if (!res.ok) {
    console.warn(`  Wikidata batch failed: ${res.status}`)
    return new Map()
  }
  const data = await res.json() as WikidataResult
  const out = new Map<string, string[]>()
  for (const b of data.results.bindings) {
    const key = b.botanical.value
    const list = out.get(key) ?? []
    const name = b.name.value.trim()
    if (name && !list.includes(name)) list.push(name)
    out.set(key, list)
  }
  return out
}

// ── GBIF ──────────────────────────────────────────────────────────────────────

interface GbifMatchResult { usageKey?: number; matchType?: string }
interface GbifVernacular { vernacularName: string; language?: string }
interface GbifVernacularResult { results: GbifVernacular[] }

async function fetchGbifNames(botanicalName: string, gbifLang: string): Promise<string[]> {
  const matchRes = await fetch(
    `${GBIF_API}/species/match?name=${encodeURIComponent(botanicalName)}`,
    { headers: { 'User-Agent': USER_AGENT } },
  )
  if (!matchRes.ok) return []
  const match = await matchRes.json() as GbifMatchResult
  if (!match.usageKey || match.matchType === 'NONE') return []

  await sleep(GBIF_DELAY_MS)

  const vernRes = await fetch(
    `${GBIF_API}/species/${match.usageKey}/vernacularNames?limit=20`,
    { headers: { 'User-Agent': USER_AGENT } },
  )
  if (!vernRes.ok) return []
  const vern = await vernRes.json() as GbifVernacularResult
  return vern.results
    .filter(v => v.language?.toUpperCase() === gbifLang)
    .map(v => v.vernacularName.trim())
    .filter(Boolean)
}

// ── Main ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  return {
    locale: get('--locale') ?? 'de',
    source: (get('--source') ?? 'both') as 'wikidata' | 'gbif' | 'both',
    force:  args.includes('--force'),
  }
}

async function main() {
  const { locale, source, force } = parseArgs()
  const langMap = LOCALE_MAP[locale]
  if (!langMap) {
    console.error(`Unsupported locale "${locale}". Add it to LOCALE_MAP.`)
    process.exit(1)
  }

  console.log(`Enriching translations: locale=${locale} source=${source} force=${force}`)

  // Fetch crops that need processing
  const existing = force ? new Set<string>() : new Set(
    (await prisma.cropTranslation.findMany({
      where: { locale },
      select: { cropId: true },
    })).map(t => t.cropId),
  )

  const crops = await prisma.crop.findMany({
    select: { id: true, botanicalName: true },
    orderBy: { botanicalName: 'asc' },
  })

  const pending = crops.filter(c => !existing.has(c.id) && c.botanicalName)
  console.log(`${pending.length} crops to process (${existing.size} already translated, ${crops.length} total)`)

  let saved = 0
  let skipped = 0

  // ── Wikidata pass (batched) ────────────────────────────────────────────────
  if (source === 'wikidata' || source === 'both') {
    console.log(`\n[Wikidata/${langMap.wikidata}] Processing ${pending.length} crops in batches of ${WIKIDATA_BATCH}...`)

    for (let i = 0; i < pending.length; i += WIKIDATA_BATCH) {
      const batch = pending.slice(i, i + WIKIDATA_BATCH)
      const batchNum = Math.floor(i / WIKIDATA_BATCH) + 1
      const totalBatches = Math.ceil(pending.length / WIKIDATA_BATCH)
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}... `)

      const results = await fetchWikidataBatch(batch.map(c => c.botanicalName), langMap.wikidata)

      for (const crop of batch) {
        const names = results.get(crop.botanicalName) ?? []
        if (names.length === 0) continue
        await prisma.cropTranslation.upsert({
          where: { cropId_locale: { cropId: crop.id, locale } },
          create: { cropId: crop.id, locale, commonNames: names },
          update: { commonNames: names },
        })
        saved++
      }

      console.log(`got ${[...results.values()].reduce((s, v) => s + v.length, 0)} names for ${results.size} crops`)
      await sleep(WD_DELAY_MS)
    }

    console.log(`[Wikidata] Done. ${saved} crops enriched.`)
  }

  // ── GBIF gap-fill pass (per-crop) ─────────────────────────────────────────
  if (source === 'gbif' || source === 'both') {
    // Only fill crops Wikidata missed (or all if source=gbif)
    const needsGbif = source === 'gbif' ? pending : pending.filter(async () => {
      // Recheck which were filled by Wikidata pass
      return true
    })

    // Re-query to find which still lack translations
    const nowTranslated = new Set(
      (await prisma.cropTranslation.findMany({
        where: { locale },
        select: { cropId: true },
      })).map(t => t.cropId),
    )
    const gbifPending = source === 'gbif'
      ? pending
      : pending.filter(c => !nowTranslated.has(c.id))

    console.log(`\n[GBIF/${langMap.gbif}] Gap-filling ${gbifPending.length} crops...`)

    for (let i = 0; i < gbifPending.length; i++) {
      const crop = gbifPending[i]
      process.stdout.write(`  [${i + 1}/${gbifPending.length}] ${crop.botanicalName}... `)

      const names = await fetchGbifNames(crop.botanicalName, langMap.gbif)
      if (names.length === 0) {
        console.log('no match')
        skipped++
        await sleep(GBIF_DELAY_MS)
        continue
      }

      await prisma.cropTranslation.upsert({
        where: { cropId_locale: { cropId: crop.id, locale } },
        create: { cropId: crop.id, locale, commonNames: names },
        update: { commonNames: names },
      })
      console.log(`${names.join(', ')}`)
      saved++
      await sleep(GBIF_DELAY_MS)
    }

    console.log(`[GBIF] Done. ${saved} total crops enriched, ${skipped} no match.`)
  }

  await prisma.$disconnect()
  console.log(`\nFinished. ${saved} translations saved.`)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
