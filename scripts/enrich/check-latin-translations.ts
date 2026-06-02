/**
 * Detects CropTranslation rows (es/fr/pt) that store botanical synonyms
 * instead of vernacular translations.
 *
 * Pattern A – same-genus + Latin epithet:
 *     first word of ALL names = botanical genus
 *     AND second word ends in a known Latin species-epithet suffix OR is a subsp/var designator
 *     OR name is just the genus alone (e.g. ["Achyrachaena"])
 *   e.g. Acacia karroo → ["Acacia eburnea"]
 *        Agave angustifolia → ["Agave vivipara"]
 *        Achyrachaena mollis → ["Achyrachaena"]
 *
 * Pattern B – same-genus near-identical variant spellings (distance ≤ 2):
 *     first word matches botanical genus AND normalised name within Levenshtein ≤ 2
 *   e.g. Agalinis aspera → ["Agalinis asperea"]
 *        Adelolecia kolaensis → ["Adelolecia kolaënsis"]
 *   Not: Acer negundo → ["Arce negundo"]  (different first word)
 *   Not: Agave americana → ["Agave américain"]  (distance 2 but different first word... actually
 *        first word IS same → but excluded because it's a well-known French translation)
 *
 * Pattern C – cross-genus Latin synonym (first word ≠ botanical genus):
 *     every name starts with a capitalised Latin-looking word (≠ botanical genus)
 *     AND second word ends in Latin suffix
 *   e.g. Faidherbia albida → ["Acacia albida"]
 *        Adiantum hispidulum → ["Cheilanthes microphylla"]
 */

import { PrismaClient } from '@prisma/client'

const LATIN_SUFFIXES = /(?:oides|odes|ensis|ense|iana|ianum|ianus|ifoliu[sm]|ifolius|phyllu[sm]|phyllus|phylla|carpu[sm]|carpus|carpa|vulgaris|vulgare|officinalis|officinale|sativus|sativa|sativum|pratensis|pratense|palustris|palustre|sylvestris|sylvestre|montanus|montana|montanum|alpinus|alpina|alpinum|americanus|americana|americanum|chinensis|chinense|japonicus|japonica|japonicum|europaeus|europaea|europaeum|australis|australe|orientalis|orientale|occidentalis|occidentale|communis|commune|repens|pubescens|procumbens|arboreus|arborea|arboreum|fruticosus|fruticosa|fruticosum|angustifolius|angustifolia|angustifolium|latifolius|latifolia|latifolium|microphyllus|microphylla|microphyllum|macrophyllus|macrophylla|macrophyllum|longifolius|longifolia|longifolium|brevifolius|brevifolia|brevifolium|ovatus|ovata|ovatum|lanceolatus|lanceolata|lanceolatum|acuminatus|acuminata|acuminatum|tomentosus|tomentosa|tomentosum|hirsutus|hirsuta|hirsutum|glabrus|glabra|glabrum|gracilis|gracile|robustus|robusta|robustum|eburneus|eburnea|eburneum|aureus|aurea|aureum|argenteus|argentea|argenteum|asper|aspera|asperum|asperus|viviparus|vivipara|viviparum|kolaensis|kolaënsis|delphinifolium|mauritanicus|mauritanica|mauritanicum|caeruleus|caerulea|caeruleum|coeruleus|coerulea|coeruleum|motorius|motoria|motorium|hookeri|calumba|scoparius|scoparia|scoparium|ledgeriana|aromaticus|aromatica|aromaticum|bonariensis|bonarensis|neo-[a-z]+|[a-z]+ensis|[a-z]+oides|[a-z]+(ii|iae|orum|arum))$/i

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function isLatinEpithet(word: string): boolean {
  const clean = word.replace(/[^a-zëüàáâãäçèéêëìíîïñòóôõöùúûü-]/gi, '')
  return LATIN_SUFFIXES.test(clean)
}

function isLatin2ndWord(name: string): boolean {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return false
  return isLatinEpithet(parts[1])
}

function hasBotanicalDesignator(name: string): boolean {
  return /\b(subsp|var|ssp|f)\b\./.test(name)
}

function isGenusAlone(name: string, genus: string): boolean {
  return name.trim().toLowerCase() === genus.toLowerCase()
}

type Reason = 'A-same-genus-latin' | 'B-same-genus-near-identical' | 'C-cross-genus-latin'

async function main() {
  const prisma = new PrismaClient()

  const rows = await prisma.cropTranslation.findMany({
    where: { locale: { in: ['es', 'fr', 'pt'] } },
    include: { crop: { select: { botanicalName: true } } },
  })

  const bad: { row: typeof rows[0]; reason: Reason }[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const names = row.commonNames
    if (names.length === 0) continue

    const botName = row.crop.botanicalName
    const botGenus = botName.split(' ')[0]
    const normBot = normalize(botName)

    const firstWords = names.map(n => n.split(/\s+/)[0])
    const allSameGenus = firstWords.every(w => w.toLowerCase() === botGenus.toLowerCase())

    // Pattern A: same genus + Latin species epithet (or subsp/var/genus-alone)
    const allSameGenusLatin = allSameGenus && names.every(n =>
      isGenusAlone(n, botGenus) || isLatin2ndWord(n) || hasBotanicalDesignator(n)
    )

    // Pattern B: same genus + near-identical variant spelling (distance ≤ 2 only)
    const normNames = names.map(normalize)
    const allSameGenusNearIdentical = allSameGenus && !allSameGenusLatin
      && normNames.every(n => levenshtein(n, normBot) <= 2)

    // Pattern C: cross-genus Latin synonym (different first word, but looks Latin)
    const allCrossLatin = !allSameGenus && names.every(n => {
      const w0 = n.split(/\s+/)[0]
      return /^[A-Z][a-z-]+$/.test(w0) && (isLatin2ndWord(n) || hasBotanicalDesignator(n))
    })

    let reason: Reason | null = null
    if (allSameGenusLatin) reason = 'A-same-genus-latin'
    else if (allSameGenusNearIdentical) reason = 'B-same-genus-near-identical'
    else if (allCrossLatin) reason = 'C-cross-genus-latin'

    if (reason && !seen.has(row.id)) {
      seen.add(row.id)
      bad.push({ row, reason })
    }
  }

  const counts = { 'A-same-genus-latin': 0, 'B-same-genus-near-identical': 0, 'C-cross-genus-latin': 0 }
  bad.forEach(b => counts[b.reason]++)

  for (const reason of ['A-same-genus-latin', 'B-same-genus-near-identical', 'C-cross-genus-latin'] as Reason[]) {
    const group = bad.filter(b => b.reason === reason)
    if (group.length === 0) continue
    console.log(`\n══ ${reason} (${group.length} rows) ══`)
    for (const { row } of group) {
      console.log(`  [${row.locale}] ${row.crop.botanicalName.padEnd(42)} → ${JSON.stringify(row.commonNames)}`)
    }
  }

  const ids = bad.map(b => b.row.id)
  console.log(`\n\nTotal flagged: ${ids.length}  (A:${counts['A-same-genus-latin']} B:${counts['B-same-genus-near-identical']} C:${counts['C-cross-genus-latin']})`)
  console.log('\n── DELETE SQL ──')
  if (ids.length > 0) {
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
    for (const chunk of chunks) {
      console.log(`DELETE FROM "CropTranslation" WHERE id IN (${chunk.map(id => `'${id}'`).join(', ')});`)
    }
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
