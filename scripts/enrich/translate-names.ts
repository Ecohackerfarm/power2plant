/**
 * Enrich CropTranslation table with vernacular names from Wikidata (primary)
 * and GBIF (gap-fill).
 *
 * Usage:
 *   pnpm enrich:translate-names                         # de via wikidata+gbif, writes to DB
 *   pnpm enrich:translate-names --locale de
 *   pnpm enrich:translate-names --locale de --source wikidata
 *   pnpm enrich:translate-names --locale de --source gbif
 *   pnpm enrich:translate-names --locale de --fetch      # fetch + write translations-de.tsv, no DB writes
 *   pnpm enrich:translate-names --import data/intl/translations-de.tsv  # import reviewed TSV into DB
 *
 * Idempotent: skips crops that already have a translation for the locale.
 * Use --force to re-fetch and overwrite existing translations.
 *
 * TSV columns: botanical_name  en_names  {locale}_names  status
 * Edit the TSV to fix/remove rows before importing.
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'

const prisma = new PrismaClient()

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const GBIF_API = 'https://api.gbif.org/v1'
const USER_AGENT = 'power2plant/0.12 (https://github.com/Ecohackerfarm/power2plant; mailto:admin@power2plant.app)'

const WIKIDATA_BATCH = 50   // taxa per SPARQL query
const GBIF_DELAY_MS  = 500  // GBIF rate-limit headroom
const WD_DELAY_MS    = 1500 // Wikidata polite crawl delay between batches
const WD_RETRY_WAIT  = 10000 // wait after 429 before retry

// BCP-47 locale → Wikidata lang code + GBIF ISO 639-2 response language code
const LOCALE_MAP: Record<string, { wikidata: string; gbif: string }> = {
  de: { wikidata: 'de', gbif: 'deu' },
  es: { wikidata: 'es', gbif: 'spa' },
  fr: { wikidata: 'fr', gbif: 'fra' },
  pt: { wikidata: 'pt', gbif: 'por' },
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Wikidata ──────────────────────────────────────────────────────────────────

interface WikidataResult {
  results: {
    bindings: Array<{
      botanical:    { value: string }
      name:         { value: string }
      nameSource:   { value: string } // "vernacular" | "label"
    }>
  }
}

let DEBUG = false

async function fetchWikidataBatch(
  botanicalNames: string[],
  lang: string,
): Promise<Map<string, string[]>> {
  const values = botanicalNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(' ')
  // P1843 (vernacular name) is primary; rdfs:label is fallback.
  // Both fetched in one query; code below picks P1843 if present.
  const query = `
    SELECT ?botanical ?name ?nameSource WHERE {
      VALUES ?botanical { ${values} }
      ?taxon wdt:P225 ?botanical .
      {
        ?taxon wdt:P1843 ?name .
        FILTER(LANG(?name) = "${lang}")
        BIND("vernacular" AS ?nameSource)
      } UNION {
        ?taxon rdfs:label ?name .
        FILTER(LANG(?name) = "${lang}")
        BIND("label" AS ?nameSource)
      }
    }
  `
  if (DEBUG) {
    console.error(`  [debug] SPARQL (${botanicalNames.length} taxa, first 3: ${botanicalNames.slice(0, 3).join(', ')}):`)
    console.error(query)
  }
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`
  let res: Response | undefined
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json' },
      })
      if (DEBUG) console.error(`  [debug] status=${res.status} content-type=${res.headers.get('content-type')}`)
      if (res.status === 429) {
        process.stderr.write(`  [429] backing off ${WD_RETRY_WAIT / 1000}s... `)
        await sleep(WD_RETRY_WAIT)
        continue
      }
      if (res.status >= 500) {
        process.stderr.write(`  [${res.status} attempt ${attempt}/3] waiting 5s... `)
        await sleep(5000)
        continue
      }
      break
    } catch (e) {
      const msg = (e as Error).message
      process.stderr.write(`  [net error attempt ${attempt}/3] ${msg} — waiting 5s... `)
      await sleep(5000)
    }
  }
  if (!res) {
    console.warn('  Wikidata batch failed: network error after 3 attempts')
    return new Map()
  }
  if (!res.ok) {
    const body = await res.text()
    console.warn(`  Wikidata batch failed: ${res.status} — ${body.slice(0, 200)}`)
    return new Map()
  }
  const text = await res.text()
  if (DEBUG) console.error(`  [debug] response (first 300): ${text.slice(0, 300)}`)
  let data: WikidataResult
  try {
    data = JSON.parse(text) as WikidataResult
  } catch (e) {
    console.warn(`  Wikidata JSON parse failed: ${(e as Error).message} — body: ${text.slice(0, 200)}`)
    return new Map()
  }

  // Collect P1843 vernacular names and rdfs:label names separately
  const vernacular = new Map<string, string[]>()
  const labels     = new Map<string, string[]>()
  for (const b of data.results.bindings) {
    const key  = b.botanical.value
    const name = b.name.value.trim()
    if (!name || name.toLowerCase() === key.toLowerCase()) continue
    const bucket = b.nameSource.value === 'vernacular' ? vernacular : labels
    const list = bucket.get(key) ?? []
    if (!list.includes(name)) list.push(name)
    bucket.set(key, list)
  }

  // Per crop: prefer P1843; fall back to rdfs:label
  const out = new Map<string, string[]>()
  for (const key of new Set([...vernacular.keys(), ...labels.keys()])) {
    out.set(key, vernacular.get(key) ?? labels.get(key) ?? [])
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
  if (DEBUG) console.error(`  [debug] GBIF match: usageKey=${match.usageKey} matchType=${match.matchType}`)
  if (!match.usageKey || match.matchType !== 'EXACT') return []

  await sleep(GBIF_DELAY_MS)

  const vernRes = await fetch(
    `${GBIF_API}/species/${match.usageKey}/vernacularNames?limit=20`,
    { headers: { 'User-Agent': USER_AGENT } },
  )
  if (!vernRes.ok) return []
  const vern = await vernRes.json() as GbifVernacularResult
  if (DEBUG) console.error(`  [debug] GBIF vernacular languages found: ${[...new Set(vern.results.map(v => v.language))].join(', ')}`)
  return [...new Set(
    vern.results
      .filter(v => v.language?.toLowerCase() === gbifLang)
      .map(v => v.vernacularName.trim())
      .filter(Boolean)
  )]
}

// ── TSV helpers ───────────────────────────────────────────────────────────────

const SEP = '\t'
const LIST_SEP = '; '

function encodeTsv(fields: string[]): string {
  return fields.map(f => f.replace(/\t/g, ' ').replace(/\n/g, ' ')).join(SEP)
}

function tsvHeader(locale: string): string {
  return encodeTsv(['botanical_name', 'en_names', `${locale}_names`, 'status'])
}

function tsvRow(botanicalName: string, enNames: string[], localNames: string[]): string {
  return encodeTsv([
    botanicalName,
    enNames.join(LIST_SEP),
    localNames.join(LIST_SEP),
    localNames.length > 0 ? 'found' : 'checked',
  ])
}

// ── Import mode ───────────────────────────────────────────────────────────────

async function runImport(filePath: string) {
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
  const header = lines[0].split(SEP)
  const localCol = header.indexOf(header.find(h => h.endsWith('_names') && h !== 'en_names') ?? '')
  if (localCol < 0) {
    console.error('Could not detect locale column in TSV header:', header.join(', '))
    process.exit(1)
  }
  const locale = header[localCol].replace('_names', '')

  console.log(`Importing ${lines.length - 1} rows for locale "${locale}" from ${filePath}`)

  // Build botanicalName → crop.id map
  const allCrops = await prisma.crop.findMany({ select: { id: true, botanicalName: true } })
  const byBotanical = new Map(allCrops.map(c => [c.botanicalName, c.id]))

  let saved = 0
  let skipped = 0
  for (const line of lines.slice(1)) {
    const cols = line.split(SEP)
    const botanicalName = cols[0]?.trim()
    const localNames    = cols[localCol]?.split(LIST_SEP).map(s => s.trim()).filter(Boolean) ?? []
    if (!botanicalName || localNames.length === 0) { skipped++; continue }
    const cropId = byBotanical.get(botanicalName)
    if (!cropId) { console.warn(`  Unknown botanical name: ${botanicalName}`); skipped++; continue }
    await prisma.cropTranslation.upsert({
      where:  { cropId_locale: { cropId, locale } },
      create: { cropId, locale, commonNames: localNames },
      update: { commonNames: localNames },
    })
    saved++
  }

  await prisma.$disconnect()
  console.log(`Done. ${saved} saved, ${skipped} skipped.`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  return {
    locale:      get('--locale') ?? 'de',
    source:      (get('--source') ?? 'both') as 'wikidata' | 'gbif' | 'both',
    force:       args.includes('--force'),
    debug:       args.includes('--debug'),
    dryRun:      args.includes('--fetch'),
    importFile:  get('--import'),
    cleanEmpty:  args.includes('--clean-empty'),
  }
}

async function main() {
  const { locale, source, force, debug, dryRun, importFile, cleanEmpty } = parseArgs()
  DEBUG = debug

  if (importFile) {
    await runImport(importFile)
    return
  }

  const outFile = `data/intl/translations-${locale}.tsv`

  if (cleanEmpty) {
    try {
      const lines = readFileSync(outFile, 'utf8').split('\n').filter(Boolean)
      const header = lines[0]
      const localCol = header.split(SEP).findIndex(h => h.endsWith('_names') && h !== 'en_names')
      const kept = lines.slice(1).filter(line => {
        const cols = line.split(SEP)
        return cols[localCol]?.trim().length > 0
      })
      writeFileSync(outFile, [header, ...kept].join('\n') + '\n', 'utf8')
      console.log(`Removed ${lines.length - 1 - kept.length} empty rows, kept ${kept.length} with names.`)
    } catch {
      console.error(`Could not read ${outFile}`)
      process.exit(1)
    }
    await prisma.$disconnect()
    return
  }

  const langMap = LOCALE_MAP[locale]
  if (!langMap) {
    console.error(`Unsupported locale "${locale}". Add it to LOCALE_MAP.`)
    process.exit(1)
  }

  // Already-fetched botanical names from a previous interrupted run
  const alreadyFetched = new Set<string>()
  if (dryRun) {
    try {
      const existing = readFileSync(outFile, 'utf8').split('\n').slice(1).filter(Boolean)
      for (const line of existing) alreadyFetched.add(line.split(SEP)[0])
      if (alreadyFetched.size > 0)
        console.log(`[FETCH] Resuming — ${alreadyFetched.size} crops already in ${outFile}, skipping them`)
      else
        writeFileSync(outFile, tsvHeader(locale) + '\n', 'utf8')
    } catch {
      writeFileSync(outFile, tsvHeader(locale) + '\n', 'utf8')
    }
    console.log(`[FETCH] Fetching translations for locale=${locale}. Results → ${outFile} (no DB writes)`)
  } else {
    console.log(`Enriching translations: locale=${locale} source=${source} force=${force}`)
  }

  const existing = force ? new Set<string>() : new Set(
    (await prisma.cropTranslation.findMany({
      where: { locale },
      select: { cropId: true },
    })).map(t => t.cropId),
  )

  const crops = await prisma.crop.findMany({
    select: { id: true, botanicalName: true, commonNames: true },
    orderBy: { botanicalName: 'asc' },
  })

  const pending = crops.filter(c => !existing.has(c.id) && c.botanicalName && !alreadyFetched.has(c.botanicalName))
  console.log(`${pending.length} crops to process (${existing.size} already translated, ${crops.length} total)`)

  let saved = 0
  let skipped = 0
  const foundThisRun = new Set<string>() // botanical names written during this run (Wikidata pass)

  // ── Wikidata pass (batched) ────────────────────────────────────────────────
  if (source === 'wikidata' || source === 'both') {
    console.log(`\n[Wikidata/${langMap.wikidata}] Processing ${pending.length} crops in batches of ${WIKIDATA_BATCH}...`)

    for (let i = 0; i < pending.length; i += WIKIDATA_BATCH) {
      const batch = pending.slice(i, i + WIKIDATA_BATCH)
      const batchNum    = Math.floor(i / WIKIDATA_BATCH) + 1
      const totalBatches = Math.ceil(pending.length / WIKIDATA_BATCH)
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}... `)

      const results = await fetchWikidataBatch(batch.map(c => c.botanicalName), langMap.wikidata)

      for (const crop of batch) {
        const names = results.get(crop.botanicalName) ?? []
        if (dryRun) {
          // Always write a row (empty de_names = no match) so resume skips this crop
          appendFileSync(outFile, tsvRow(crop.botanicalName, crop.commonNames, names) + '\n', 'utf8')
        } else if (names.length > 0) {
          await prisma.cropTranslation.upsert({
            where:  { cropId_locale: { cropId: crop.id, locale } },
            create: { cropId: crop.id, locale, commonNames: names },
            update: { commonNames: names },
          })
        }
        if (names.length > 0) { foundThisRun.add(crop.botanicalName); saved++ }
      }

      console.log(`got ${[...results.values()].reduce((s, v) => s + v.length, 0)} names for ${results.size} crops`)
      if (results.size > 0) await sleep(WD_DELAY_MS)
    }

    console.log(`[Wikidata] Done. ${saved} crops enriched.`)
  }

  // ── GBIF gap-fill pass (per-crop) ─────────────────────────────────────────
  if (source === 'gbif' || source === 'both') {
    const nowTranslated = dryRun
      ? new Set(existing)
      : new Set(
          (await prisma.cropTranslation.findMany({
            where: { locale },
            select: { cropId: true },
          })).map(t => t.cropId),
        )

    const gbifPending = source === 'gbif'
      ? pending
      : pending.filter(c => !nowTranslated.has(c.id) && !foundThisRun.has(c.botanicalName))

    console.log(`\n[GBIF/${langMap.gbif}] Gap-filling ${gbifPending.length} crops...`)

    for (let i = 0; i < gbifPending.length; i++) {
      const crop = gbifPending[i]
      const enLabel = crop.commonNames.length > 0 ? ` [${crop.commonNames.slice(0, 2).join(', ')}]` : ''
      process.stdout.write(`  [${i + 1}/${gbifPending.length}] ${crop.botanicalName}${enLabel}... `)

      const names = await fetchGbifNames(crop.botanicalName, langMap.gbif)
      if (dryRun) {
        // Always write a row so resume skips this crop
        appendFileSync(outFile, tsvRow(crop.botanicalName, crop.commonNames, names) + '\n', 'utf8')
      }
      if (names.length === 0) {
        console.log('no match')
        skipped++
        await sleep(GBIF_DELAY_MS)
        continue
      }

      if (!dryRun) {
        await prisma.cropTranslation.upsert({
          where:  { cropId_locale: { cropId: crop.id, locale } },
          create: { cropId: crop.id, locale, commonNames: names },
          update: { commonNames: names },
        })
      }
      console.log(`→ ${names.join(', ')}`)
      saved++
      await sleep(GBIF_DELAY_MS)
    }

    console.log(`[GBIF] Done. ${saved} total crops enriched, ${skipped} no match.`)
  }

  if (dryRun) {
    console.log(`\n[FETCH] ${saved} translations written to ${outFile}. Review, edit if needed, then import:`)
    console.log(`  pnpm enrich:translate-names --import ${outFile}`)
  }

  await prisma.$disconnect()
  if (!dryRun) console.log(`\nFinished. ${saved} translations saved.`)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
