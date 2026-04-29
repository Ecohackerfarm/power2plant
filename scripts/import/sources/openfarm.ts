import type { Importer } from '../types'
import { SourceType } from '@prisma/client'
export const openFarmImporter: Importer = { source: SourceType.OPENFARM_DUMP }
