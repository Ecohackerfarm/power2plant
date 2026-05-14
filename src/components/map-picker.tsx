'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Map, Marker } from 'leaflet'

interface MapPickerProps {
  onSelect: (lat: number, lng: number) => void
  initialLat?: number
  initialLng?: number
}

export function MapPicker({ onSelect, initialLat = 20, initialLng = 0 }: MapPickerProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  // Keep a stable ref so the click handler always calls the latest onSelect
  // without needing to recreate the Leaflet map on every render.
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    let L: typeof import('leaflet')

    import('leaflet').then((mod) => {
      L = mod.default ?? mod
      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(divRef.current!).setView([initialLat, initialLng], 2)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      map.on('click', (e: L.LeafletMouseEvent) => {
        markerRef.current?.remove()
        markerRef.current = L.marker(e.latlng).addTo(map)
        onSelectRef.current(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={divRef} style={{ height: '320px', width: '100%' }} />
}
