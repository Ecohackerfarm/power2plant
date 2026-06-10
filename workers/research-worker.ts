/**
 * Research queue worker. Polls for PENDING items, processes one at a time.
 * Run via: npm run worker:research
 * Managed by docker-compose service `research-worker`.
 */
import { PrismaClient } from '@prisma/client'
import { processQueueItem } from '../src/lib/research/executor'

const prisma = new PrismaClient()
const POLL_INTERVAL_MS = 10_000
let stopping = false

process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })

async function pickNextItem(): Promise<string | null> {
  // Atomic grab: update only if still PENDING to prevent double-processing
  const items = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "ResearchQueue"
    SET status = 'IN_PROGRESS', "startedAt" = NOW()
    WHERE id = (
      SELECT id FROM "ResearchQueue"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `
  return items[0]?.id ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run(): Promise<void> {
  console.log('Research worker started')

  while (!stopping) {
    try {
      const queueId = await pickNextItem()
      if (queueId) {
        console.log(`Processing queue item ${queueId}`)
        try {
          await processQueueItem(queueId)
          console.log(`Done: ${queueId}`)
        } catch (err) {
          console.error(`Failed: ${queueId}`, err instanceof Error ? err.message : err)
        }
        // Immediately check for next item rather than waiting
        continue
      }
    } catch (err) {
      console.error('Worker poll error:', err)
    }
    await sleep(POLL_INTERVAL_MS)
  }

  console.log('Research worker stopped')
  await prisma.$disconnect()
}

run().catch(err => {
  console.error('Worker crashed:', err)
  process.exit(1)
})
