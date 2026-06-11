// EU VAT ID format patterns keyed by 2-letter country code.
// Each regex matches only the numeric/alphanumeric part AFTER the country prefix.
const VAT_FORMATS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^\d{10}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,   // Greece uses EL prefix in VAT context
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^\d{7}[A-Z]{1,2}$|^\d[A-Z]\d{5}[A-Z]$/,
  IT: /^\d{11}$/,
  LT: /^\d{9}$|^\d{12}$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
}

export interface VatParseResult {
  countryCode: string
  number: string
  raw: string
}

/** Split "DE123456789" → { countryCode: "DE", number: "123456789" } */
export function parseVatId(vatId: string): VatParseResult | null {
  const cleaned = vatId.trim().toUpperCase().replace(/[\s\-\.]/g, '')
  if (cleaned.length < 4) return null
  const cc = cleaned.slice(0, 2)
  const number = cleaned.slice(2)
  if (!/^[A-Z]{2}$/.test(cc)) return null
  return { countryCode: cc, number, raw: cleaned }
}

/** Format-only check — no network. */
export function isValidVatFormat(vatId: string): boolean {
  const parsed = parseVatId(vatId)
  if (!parsed) return false
  const pattern = VAT_FORMATS[parsed.countryCode]
  if (!pattern) return false   // not an EU country we know
  return pattern.test(parsed.number)
}

export interface ViesResult {
  valid: boolean
  name?: string
  address?: string
  error?: 'network' | 'invalid' | 'service_unavailable'
}

/**
 * Validate against EU VIES service.
 * Falls back gracefully — a network error does not make the VAT ID invalid,
 * it just means we couldn't confirm it.
 */
export async function checkVies(vatId: string): Promise<ViesResult> {
  const parsed = parseVatId(vatId)
  if (!parsed) return { valid: false, error: 'invalid' }
  if (!VAT_FORMATS[parsed.countryCode]) return { valid: false, error: 'invalid' }

  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${parsed.countryCode}/vat/${parsed.number}`

  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5_000)
    const res = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer))

    if (!res.ok) return { valid: false, error: 'service_unavailable' }

    const data = await res.json() as { isValid?: boolean; traderName?: string; traderAddress?: string }
    return {
      valid: data.isValid === true,
      name: data.traderName ?? undefined,
      address: data.traderAddress ?? undefined,
    }
  } catch {
    return { valid: false, error: 'network' }
  }
}
