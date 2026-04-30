import { NextResponse } from 'next/server'

interface MeteoResponse {
  daily: {
    time: string[]
    temperature_2m_min: number[]
  }
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

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lat must be -90..90 and lng must be -180..180' }, { status: 400 })
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
  const mins = Object.values(
    (data.daily.time ?? []).reduce<Record<number, number>>((acc, t, i) => {
      const year = new Date(t).getUTCFullYear()
      const temp = data.daily.temperature_2m_min[i]
      if (acc[year] === undefined || temp < acc[year]) acc[year] = temp
      return acc
    }, {}),
  )
  if (mins.length === 0) {
    return NextResponse.json({ error: 'climate data unavailable' }, { status: 502 })
  }
  const minTempC = mins.reduce((a, b) => a + b, 0) / mins.length

  return NextResponse.json({ minTempC: Math.round(minTempC * 10) / 10 })
}
