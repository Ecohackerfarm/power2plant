import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Importer, RawCrop, RawRelationship } from '../types'
import { ConfidenceLevel, Direction, RelationshipType, SourceType } from '@prisma/client'

const DATA_PATH = resolve(process.cwd(), 'data/openfarm/crops.json')

type OpenFarmCrop = {
  id: string
  name: string
  slug: string
  binomial_name: string | null
  description: string | null
  main_image_path: string | null
  companions: { id: string; name: string }[]
}

export const openFarmImporter: Importer = {
  source: SourceType.OPENFARM_DUMP,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const crops: OpenFarmCrop[] = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    for (const crop of crops) {
      if (!crop.binomial_name) continue
      yield {
        botanicalName: crop.binomial_name,
        name: crop.name,
        externalId: crop.id,
        imageUrl: crop.main_image_path ?? null,
        rawData: crop,
      }
    }
  },

  async *fetchRelationships(): AsyncIterable<RawRelationship> {
    const crops: OpenFarmCrop[] = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    const idToName = new Map(crops.map(c => [c.id, c.binomial_name ?? c.name]))

    for (const crop of crops) {
      if (!crop.binomial_name) continue
      for (const companion of crop.companions ?? []) {
        const companionName = idToName.get(companion.id) ?? companion.name
        yield {
          cropNameA: crop.binomial_name,
          cropNameB: companionName,
          type: RelationshipType.COMPANION,
          direction: Direction.MUTUAL,
          confidence: ConfidenceLevel.ANECDOTAL,
          url: 'https://github.com/openfarmcc/OpenFarm',
        }
      }
    }
  },
}
