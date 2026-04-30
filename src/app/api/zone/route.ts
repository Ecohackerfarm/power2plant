import { NextResponse } from 'next/server'

interface MeteoResponse {
  daily: {
    time: string[]
    temperature_2m_min: number[]
  }
}

function averageAnnualMin(times: string[], temps: number[]): number {
  const byYear: Record<number, number> = {}
  times.forEach((t, i) => {
    const year = new Date(t).getUTCFullYear()
    if (byYear[year] === undefined || temps[i] < byYear[year]) {
      byYear[year] = temps[i]
    }
  })
  const mins = Object.values(byYear)
  return mins.reduce((a, b) => a + b, 0) / mins.length
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 })
  }

  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('start_date', '2019-01-01')
  url.searchParams.set('end_date', '2023-12-31')
  url.searchParams.set('daily', 'temperature_2m_min')
  url.searchParams.set('timezone', 'UTC')

  const upstream = await fetch(url.toString())
  if (!upstream.ok) {
    return NextResponse.json({ error: 'climate data unavailable' }, { status: 502 })
  }

  const data: MeteoResponse = await upstream.json()
  const minTempC = averageAnnualMin(data.daily.time, data.daily.temperature_2m_min)

  return NextResponse.json({ minTempC: Math.round(minTempC * 10) / 10 })
}
