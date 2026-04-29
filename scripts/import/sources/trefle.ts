import type { Importer, RawCrop } from '../types'
import { SourceType } from '@prisma/client'

const BASE_URL = 'https://trefle.io/api/v1'
const RATE_LIMIT_MS = 500  // 120 req/min

type TreflePlant = {
  id: number
  common_name: string | null
  slug: string
  scientific_name: string
  image_url: string | null
  main_species?: {
    growth?: {
      minimum_temperature?: {
        deg_c?: number
      }
    }
  }
}

type TrefleResponse = {
  data: TreflePlant[]
  links: { next: string | null }
}

export const trefleImporter: Importer = {
  source: SourceType.TREFLE,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const token = process.env.TREFLE_TOKEN
    if (!token || token === 'your_trefle_token_here') {
      console.warn('[TREFLE] TREFLE_TOKEN not set — skipping')
      return
    }

    const maxPages = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : Infinity
    let page = 1

    while (page <= maxPages) {
      const res = await fetch(`${BASE_URL}/plants?token=${token}&page=${page}`)
      if (!res.ok) throw new Error(`Trefle API ${res.status}: ${await res.text()}`)

      const json = await res.json() as TrefleResponse

      for (const plant of json.data) {
        if (!plant.scientific_name) continue
        yield {
          botanicalName: plant.scientific_name,
          name: plant.common_name ?? plant.scientific_name,
          slug: plant.slug,
          minTempC: plant.main_species?.growth?.minimum_temperature?.deg_c ?? null,
          imageUrl: plant.image_url ?? null,
          externalId: String(plant.id),
          rawData: plant,
        }
      }

      if (!json.links.next) break
      page++
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  },
}
