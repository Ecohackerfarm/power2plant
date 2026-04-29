import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Importer, RawRelationship } from '../types'
import { ConfidenceLevel, Direction, RelationshipType, SourceType } from '@prisma/client'

const DATA_PATH = resolve(process.cwd(), 'data/plantbuddies/relations-data.js')

type PBRelation = { id: number; p1: string; p2: string; b: 1 | -1 }

export function parseRelationsJs(js: string): PBRelation[] {
  const match = js.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Cannot find array in PlantBuddies JS')

  let raw = match[0]

  // Protect string values from key-quoting by replacing them with placeholders
  const strings: string[] = []
  raw = raw.replace(/"[^"]*"/g, m => {
    strings.push(m)
    return `"__STR${strings.length - 1}__"`
  })

  // Quote unquoted object keys
  raw = raw.replace(/(\b\w+)(?=\s*:)/g, '"$1"')

  // Remove trailing commas before ] or }
  raw = raw.replace(/,(\s*[}\]])/g, '$1')

  // Restore protected string values
  raw = raw.replace(/"__STR(\d+)__"/g, (_, i) => strings[parseInt(i, 10)])

  const parsed: Array<{ id: number; p1: string; p2: string; b: number | string }> = JSON.parse(raw)

  return parsed
    .filter((r): r is PBRelation => r.b === 1 || r.b === -1)
    .map(r => ({ ...r, p1: r.p1.replace(/_/g, ' '), p2: r.p2.replace(/_/g, ' ') }))
}

export const plantBuddiesImporter: Importer = {
  source: SourceType.PLANTBUDDIES,

  async *fetchRelationships(): AsyncIterable<RawRelationship> {
    const js = readFileSync(DATA_PATH, 'utf-8')
    const relations = parseRelationsJs(js)

    for (const rel of relations) {
      yield {
        cropNameA: rel.p1,
        cropNameB: rel.p2,
        type: rel.b === 1 ? RelationshipType.COMPANION : RelationshipType.AVOID,
        direction: Direction.MUTUAL,
        confidence: ConfidenceLevel.TRADITIONAL,
        url: 'https://github.com/serlo/PlantBuddies',
      }
    }
  },
}
