export interface CropRow {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
  isCommonCrop: boolean
  commonNames: string[]
  rank?: 'genus' | 'species'
}

// Genus: single capitalised word + optional author abbreviation (e.g. "Ocimum", "Ocimum L.")
const GENUS_RE = /^[A-Z][a-z]+(\s+[A-Z][a-z.]*\.?)?$/

export function detectRank(botanicalName: string): 'genus' | 'species' {
  return GENUS_RE.test(botanicalName.trim()) ? 'genus' : 'species'
}

function score(crop: CropRow, ql: string): number {
  const nameLower = crop.name.toLowerCase()
  const cns = crop.commonNames.map(cn => cn.toLowerCase())

  if (nameLower === ql || cns.includes(ql)) return 0

  const startsWithName = nameLower.startsWith(ql)
  const startsWithCn = cns.some(cn => cn.startsWith(ql))
  if (startsWithName || startsWithCn) return crop.isCommonCrop ? 1 : 2

  return crop.isCommonCrop ? 3 : 4
}

export function rankCrops(crops: CropRow[], query: string): CropRow[] {
  const ql = query.toLowerCase().trim()
  return crops.slice().sort((a, b) => {
    const diff = score(a, ql) - score(b, ql)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}
