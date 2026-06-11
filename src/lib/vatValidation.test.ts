import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseVatId, isValidVatFormat, checkVies } from './vatValidation'

describe('parseVatId', () => {
  it('splits country code and number', () => {
    expect(parseVatId('DE123456789')).toEqual({ countryCode: 'DE', number: '123456789', raw: 'DE123456789' })
  })
  it('normalises lowercase', () => {
    expect(parseVatId('de123456789')).toEqual({ countryCode: 'DE', number: '123456789', raw: 'DE123456789' })
  })
  it('strips spaces and dashes', () => {
    expect(parseVatId('DE 123 456 789')).toEqual({ countryCode: 'DE', number: '123456789', raw: 'DE123456789' })
  })
  it('returns null for too-short input', () => {
    expect(parseVatId('DE')).toBeNull()
  })
  it('returns null for numeric-only input', () => {
    expect(parseVatId('123456789')).toBeNull()
  })
})

describe('isValidVatFormat', () => {
  const valid: [string, string][] = [
    ['DE', 'DE123456789'],
    ['AT', 'ATU12345678'],
    ['FR', 'FRAA123456789'],
    ['NL', 'NL123456789B01'],
    ['PL', 'PL1234567890'],
    ['SE', 'SE123456789012'],
    ['IT', 'IT12345678901'],
    ['ES', 'ESA1234567A'],
  ]

  const invalid: [string, string][] = [
    ['DE too short',   'DE12345678'],
    ['DE too long',    'DE1234567890'],
    ['AT missing U',   'AT12345678'],
    ['NL missing B',   'NL123456789C01'],
    ['unknown country','XX123456789'],
    ['no country prefix', '123456789'],
  ]

  for (const [label, vatId] of valid) {
    it(`accepts ${label} — ${vatId}`, () => {
      expect(isValidVatFormat(vatId)).toBe(true)
    })
  }

  for (const [label, vatId] of invalid) {
    it(`rejects ${label} — ${vatId}`, () => {
      expect(isValidVatFormat(vatId)).toBe(false)
    })
  }
})

describe('checkVies', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns valid:true when VIES confirms', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: true, traderName: 'Acme GmbH', traderAddress: 'Berlin' }),
    }))
    const result = await checkVies('DE123456789')
    expect(result.valid).toBe(true)
    expect(result.name).toBe('Acme GmbH')
    expect(result.address).toBe('Berlin')
  })

  it('returns valid:false when VIES says invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: false }),
    }))
    const result = await checkVies('DE000000000')
    expect(result.valid).toBe(false)
    expect(result.error).toBeUndefined()
  })

  it('returns network error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const result = await checkVies('DE123456789')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('network')
  })

  it('returns service_unavailable on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await checkVies('DE123456789')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('service_unavailable')
  })

  it('returns invalid for bad format before calling fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const result = await checkVies('XX999')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('invalid')
    expect(spy).not.toHaveBeenCalled()
  })
})
