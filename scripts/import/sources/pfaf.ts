import type { Importer } from '../types'
import { SourceType } from '@prisma/client'
export const pfafImporter: Importer = { source: SourceType.PFAF }
