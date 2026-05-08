import type { SourceClassification } from '@prisma/client'

const SCIENTIFIC_HOSTNAMES = [
  'doi.org',
  'pubmed.ncbi.nlm.nih.gov',
  'scholar.google.com',
]

const GARDEN_HOSTNAMES = [
  'rhs.org.uk',
  'almanac.com',
  'gardenersworld.com',
  'extension.org',
  'growveg.com',
  'pfaf.org',
]

export function classifyUrl(url: string): SourceClassification {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'BLOG_FORUM'
  }

  const hostname = parsed.hostname.toLowerCase()

  if (SCIENTIFIC_HOSTNAMES.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return 'SCIENTIFIC_PAPER'
  }

  if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk')) {
    return 'ACADEMIC_RESOURCE'
  }

  if (GARDEN_HOSTNAMES.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return 'GARDENING_GUIDE'
  }

  return 'BLOG_FORUM'
}
