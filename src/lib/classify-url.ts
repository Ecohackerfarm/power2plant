export type SourceClassification = 'SCIENTIFIC_PAPER' | 'ACADEMIC_RESOURCE' | 'GARDENING_GUIDE' | 'BLOG_FORUM'

export function classifyUrl(url: string): SourceClassification {
  if (!url || url.trim() === '') return 'BLOG_FORUM'
  const u = url.trim().toLowerCase()
  let hostname: string
  try {
    hostname = new URL(u.startsWith('http') ? u : `https://${u}`).hostname
  } catch {
    return 'BLOG_FORUM'
  }
  if (hostname === 'doi.org' || hostname.includes('pubmed') || hostname.includes('scholar.google')) {
    return 'SCIENTIFIC_PAPER'
  }
  if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk')) {
    return 'ACADEMIC_RESOURCE'
  }
  if (hostname === 'rhs.org.uk' || hostname === 'www.rhs.org.uk' || hostname === 'almanac.com' || hostname === 'www.almanac.com') {
    return 'GARDENING_GUIDE'
  }
  return 'BLOG_FORUM'
}