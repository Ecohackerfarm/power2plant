/**
 * Generates data/research/discovered-pairs.json for the research pipeline.
 *
 * Modes (--mode <mode>):
 *   unreviewed          All CropRelationship pairs lacking a PEER_REVIEWED source (default)
 *   voted               ResearchRequest pairs ordered by voteCount desc
 *   plants <name...>    Pairs involving any of the named plants that lack a PEER_REVIEWED source
 *
 * Flags:
 *   --limit <n>         Max pairs to emit (all modes)
 *   --min-votes <n>     Skip requests with fewer votes (voted mode only)
 *
 * Usage:
 *   npx tsx scripts/research/fetch-unreviewed-pairs.ts
 *   npx tsx scripts/research/fetch-unreviewed-pairs.ts --mode voted --limit 50
 *   npx tsx scripts/research/fetch-unreviewed-pairs.ts --mode plants "Solanum lycopersicum" "Ocimum basilicum"
 */
import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const prisma = new PrismaClient()

interface Pair {
  cropA: string
  cropB: string
}

// Resolve name (botanical, common, or synonym) to a crop ID. Returns null if not found.
async function resolveCropId(name: string): Promise<string | null> {
  const byBotanical = await prisma.crop.findUnique({ where: { botanicalName: name } })
  if (byBotanical) return byBotanical.id

  const matches = await prisma.crop.findMany({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { commonNames: { has: name } },
      ],
    },
    orderBy: [{ isCommonCrop: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  return matches[0]?.id ?? null
}

async function getPeerReviewedRelIds(): Promise<Set<string>> {
  const rows = await prisma.relationshipSource.findMany({
    where: { confidence: 'PEER_REVIEWED' },
    select: { relationshipId: true },
    distinct: ['relationshipId'],
  })
  return new Set(rows.map(r => r.relationshipId))
}

async function modeUnreviewed(limit?: number): Promise<Pair[]> {
  const prIds = await getPeerReviewedRelIds()
  const rels = await prisma.cropRelationship.findMany({
    select: {
      id: true,
      cropA: { select: { botanicalName: true } },
      cropB: { select: { botanicalName: true } },
    },
  })
  const pairs = rels
    .filter(r => !prIds.has(r.id))
    .map(r => ({ cropA: r.cropA.botanicalName, cropB: r.cropB.botanicalName }))
  process.stderr.write(`unreviewed: ${pairs.length} pairs lack PEER_REVIEWED source\n`)
  return limit ? pairs.slice(0, limit) : pairs
}

async function modeVoted(minVotes: number, limit?: number): Promise<Pair[]> {
  const requests = await prisma.researchRequest.findMany({
    where: { voteCount: { gte: minVotes }, cropBId: { not: null } },
    orderBy: { voteCount: 'desc' },
    ...(limit ? { take: limit } : {}),
    select: {
      voteCount: true,
      cropA: { select: { botanicalName: true } },
      cropB: { select: { botanicalName: true } },
    },
  })
  process.stderr.write(`voted: ${requests.length} research requests (min votes: ${minVotes})\n`)
  requests.forEach(r =>
    process.stderr.write(`  ${r.cropA.botanicalName} + ${r.cropB!.botanicalName} (${r.voteCount} votes)\n`)
  )
  return requests.map(r => ({ cropA: r.cropA.botanicalName, cropB: r.cropB!.botanicalName }))
}

async function modePlants(names: string[], limit?: number): Promise<Pair[]> {
  const ids = (await Promise.all(names.map(n => resolveCropId(n)))).filter(Boolean) as string[]
  const unresolved = names.filter((_, i) => !ids[i])
  if (unresolved.length) {
    process.stderr.write(`WARN: could not resolve: ${unresolved.join(', ')}\n`)
  }
  if (!ids.length) {
    process.stderr.write('No plants resolved — exiting\n')
    return []
  }

  const prIds = await getPeerReviewedRelIds()
  const rels = await prisma.cropRelationship.findMany({
    where: {
      OR: [{ cropAId: { in: ids } }, { cropBId: { in: ids } }],
    },
    select: {
      id: true,
      cropA: { select: { botanicalName: true } },
      cropB: { select: { botanicalName: true } },
    },
  })
  const pairs = rels
    .filter(r => !prIds.has(r.id))
    .map(r => ({ cropA: r.cropA.botanicalName, cropB: r.cropB.botanicalName }))
  process.stderr.write(`plants: ${pairs.length} unreviewed pairs involving [${names.join(', ')}]\n`)
  return limit ? pairs.slice(0, limit) : pairs
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const modeIdx = args.indexOf('--mode')
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'unreviewed'

  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined

  const minVotesIdx = args.indexOf('--min-votes')
  const minVotes = minVotesIdx >= 0 ? parseInt(args[minVotesIdx + 1], 10) : 1

  // Plant names: everything after --mode plants that doesn't start with --
  const plantNames: string[] = []
  if (mode === 'plants') {
    let i = modeIdx + 2
    while (i < args.length && !args[i].startsWith('--')) {
      plantNames.push(args[i++])
    }
    if (!plantNames.length) {
      console.error('--mode plants requires at least one plant name')
      process.exit(1)
    }
  }

  let pairs: Pair[]
  if (mode === 'unreviewed') {
    pairs = await modeUnreviewed(limit)
  } else if (mode === 'voted') {
    pairs = await modeVoted(minVotes, limit)
  } else if (mode === 'plants') {
    pairs = await modePlants(plantNames, limit)
  } else {
    console.error(`Unknown mode: ${mode}. Use: unreviewed | voted | plants`)
    process.exit(1)
  }

  const outputDir = resolve(process.cwd(), 'data/research')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = resolve(outputDir, 'discovered-pairs.json')
  writeFileSync(outputPath, JSON.stringify(pairs, null, 2))
  process.stderr.write(`Wrote ${pairs.length} pairs to ${outputPath}\n`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
