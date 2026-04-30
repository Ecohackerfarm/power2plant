export interface GardenState {
  lat: number | null
  lng: number | null
  minTempC: number | null
  bedCount: number
  bedCapacity: number
  wishlist: string[]
}

export const DEFAULT_STATE: GardenState = {
  lat: null,
  lng: null,
  minTempC: null,
  bedCount: 3,
  bedCapacity: 3,
  wishlist: [],
}

const STORAGE_KEY = 'power2plant:garden'

export function loadState(): GardenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(state: GardenState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}
