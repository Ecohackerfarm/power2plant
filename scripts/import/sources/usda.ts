import { createReadStream } from 'fs'
import { resolve } from 'path'
import { parse } from 'csv-parse'
import type { Importer, RawCrop } from '../types'
import { SourceType } from '@prisma/client'
import { toSlug } from '../normalize'

const CSV_PATH = resolve(process.cwd(), 'data/usda/plants.csv')

export const usdaImporter: Importer = {
  source: SourceType.USDA,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const parser = createReadStream(CSV_PATH).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        record_delimiter: '\r',
        relax_column_count: true,
        bom: true,
      })
    )

    for await (const row of parser as AsyncIterable<Record<string, string>>) {
      const scientificName = row['Scientific Name'] || row['scientific_name']
      const commonName =
        row['Common Name'] || row['common_name'] || row['National Common Name']

      if (!scientificName?.trim()) continue

      // Extract genus + species only (strip author citation)
      const parts = scientificName.trim().split(/\s+/)
      if (parts.length < 2) continue
      const botanicalName = `${parts[0]} ${parts[1]}`

      yield {
        botanicalName,
        name: commonName?.trim() || botanicalName,
        slug: toSlug(botanicalName),
        externalId: row['Accepted Symbol']?.trim() || row['Symbol']?.trim(),
        rawData: row,
      }
    }
  },
}
