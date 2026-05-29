/**
 * Reads db-sources.json (dumped via psql) and fetches abstracts for each DOI
 * from CrossRef (primary) or Semantic Scholar (fallback).
 * Writes papers.json in the shape consumed by verify-botanical.ts.
 *
 * Generate db-sources.json with:
 *   PGPASSWORD=... psql "$DATABASE_URL" -t -A -c "
 *     SELECT json_agg(row_to_json(t)) FROM (
 *       SELECT DISTINCT rs.url,
 *         ca.name as \"cropAName\", ca.\"botanicalName\" as \"cropABotanical\",
 *         cb.name as \"cropBName\", cb.\"botanicalName\" as \"cropBBotanical\"
 *       FROM \"RelationshipSource\" rs
 *       JOIN \"CropRelationship\" cr ON rs.\"relationshipId\" = cr.id
 *       JOIN \"Crop\" ca ON cr.\"cropAId\" = ca.id
 *       JOIN \"Crop\" cb ON cr.\"cropBId\" = cb.id
 *       WHERE rs.source = 'RESEARCH' AND rs.url IS NOT NULL
 *     ) t;" > data/research/db-sources.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

type DbSource = {
  url: string
  cropAName: string
  cropABotanical: string
  cropBName: string
  cropBBotanical: string
}

type Paper = {
  cropA: string
  cropB: string
  cropABotanical: string
  cropBBotanical: string
  paperId: string
  title: string
  abstract: string | null
  doi: string
  year: number
  source: string
  noAbstract?: true
}

const USER_AGENT = 'power2plant-research-bot/1.0'
const RATE_MS = 400

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function abstractFromCrossRef(doi: string): Promise<{ abstract: string; title: string; year: number } | null> {
  try {
    const data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`) as {
      message?: {
        abstract?: string
        title?: string[]
        'published-print'?: { 'date-parts': number[][] }
        'published-online'?: { 'date-parts': number[][] }
      }
    }
    const msg = data.message
    if (!msg?.abstract) return null
    const dateParts =
      msg['published-print']?.['date-parts']?.[0] ??
      msg['published-online']?.['date-parts']?.[0]
    return {
      abstract: msg.abstract.replace(/<[^>]+>/g, ' ').trim(),
      title: msg.title?.[0] ?? '',
      year: dateParts?.[0] ?? 0,
    }
  } catch {
    return null
  }
}

async function abstractFromSemanticScholar(doi: string): Promise<{ abstract: string; title: string; year: number } | null> {
  try {
    const data = await fetchJson(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,abstract,year`
    ) as { abstract?: string; title?: string; year?: number }
    if (!data.abstract) return null
    return { abstract: data.abstract, title: data.title ?? '', year: data.year ?? 0 }
  } catch {
    return null
  }
}

async function main() {
  const inputPath = join(ROOT, 'data/research/db-sources.json')
  const sources: DbSource[] = JSON.parse(readFileSync(inputPath, 'utf-8'))

  // Deduplicate by DOI — same paper can cover multiple crop pairs
  const byDoi = new Map<string, DbSource[]>()
  for (const src of sources) {
    const doi = src.url.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    if (!byDoi.has(doi)) byDoi.set(doi, [])
    byDoi.get(doi)!.push(src)
  }

  console.log(`${sources.length} sources → ${byDoi.size} unique DOIs`)

  const papers: Paper[] = []
  let i = 0
  for (const [doi, srcs] of byDoi) {
    i++
    process.stdout.write(`[${i}/${byDoi.size}] ${doi} … `)

    let info = await abstractFromCrossRef(doi)
    if (!info) {
      await sleep(RATE_MS)
      info = await abstractFromSemanticScholar(doi)
    }

    if (!info) {
      console.warn(`⚠  NO ABSTRACT — ${doi} (${srcs.map(s => `${s.cropAName}+${s.cropBName}`).join(', ')})`)
      for (const src of srcs) {
        papers.push({
          cropA: src.cropAName,
          cropB: src.cropBName,
          cropABotanical: src.cropABotanical,
          cropBBotanical: src.cropBBotanical,
          paperId: doi,
          title: '',
          abstract: null,
          doi,
          year: 0,
          source: 'unknown',
          noAbstract: true,
        })
      }
      await sleep(RATE_MS)
      continue
    }
    console.log(`ok (${info.year})`)

    for (const src of srcs) {
      papers.push({
        cropA: src.cropAName,
        cropB: src.cropBName,
        cropABotanical: src.cropABotanical,
        cropBBotanical: src.cropBBotanical,
        paperId: doi,
        title: info.title,
        abstract: info.abstract,
        doi,
        year: info.year,
        source: 'crossref',
      })
    }

    await sleep(RATE_MS)
  }

  const noAbstract = papers.filter(p => p.noAbstract)
  const out = join(ROOT, 'data/research/papers.json')
  writeFileSync(out, JSON.stringify(papers, null, 2))
  console.log(`\nWrote ${papers.length} entries to ${out}`)
  if (noAbstract.length > 0) {
    console.warn(`\n⚠  ${noAbstract.length} pairs could NOT be verified (no abstract found):`)
    for (const p of noAbstract) {
      console.warn(`   https://doi.org/${p.doi}  →  ${p.cropA} + ${p.cropB}`)
    }
    console.warn(`\n   These sources remain in the DB unverified. Review manually.`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
