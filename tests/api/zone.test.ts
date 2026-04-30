import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/zone/route'

// Build a fake Open-Meteo response covering 2 years (2022 + 2023)
function makeMeteoResponse(year1Min: number, year2Min: number) {
  const time = [`${2022}-01-15`, `${2023}-01-15`]
  const temperature_2m_min = [year1Min, year2Min]
  return { daily: { time, temperature_2m_min } }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('GET /api/zone', () => {
  it('returns 400 when lat/lng missing', async () => {
    const req = new Request('http://localhost/api/zone')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 400 for invalid coordinates', async () => {
    const req = new Request('http://localhost/api/zone?lat=abc&lng=0')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('computes average annual extreme minimum', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => makeMeteoResponse(-10, -20),
    } as Response)

    const req = new Request('http://localhost/api/zone?lat=51.5&lng=-0.1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    // avg of [-10, -20] = -15
    expect(body.minTempC).toBeCloseTo(-15, 1)
  })

  it('returns 502 when Open-Meteo fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
    } as Response)

    const req = new Request('http://localhost/api/zone?lat=51.5&lng=-0.1')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})
