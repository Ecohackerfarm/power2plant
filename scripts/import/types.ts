import type { ConfidenceLevel, Direction, RelationshipReason, RelationshipType, SourceType } from '@prisma/client'

export interface RawCrop {
  botanicalName: string
  name?: string
  slug?: string
  minTempC?: number | null
  isNitrogenFixer?: boolean
  imageUrl?: string | null
  externalId?: string
  rawData: unknown
}

export interface RawRelationship {
  cropNameA: string
  cropNameB: string
  type: RelationshipType
  direction: Direction
  reason?: RelationshipReason
  confidence: ConfidenceLevel
  url?: string
  notes?: string
}

export interface Importer {
  source: SourceType
  fetchCrops?(): AsyncIterable<RawCrop>
  fetchRelationships?(): AsyncIterable<RawRelationship>
}

export interface ImportStats {
  source: SourceType
  cropsCreated: number
  cropsUpdated: number
  relationshipsCreated: number
  relationshipsUpdated: number
  unresolved: string[]
}
