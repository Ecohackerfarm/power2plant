import type { Importer } from '../types'
import { SourceType } from '@prisma/client'
export const usdaImporter: Importer = { source: SourceType.USDA }
