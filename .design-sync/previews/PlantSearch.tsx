import { useState } from "react"
import { PlantSearch } from "power2plant"

// PlantSearch is controlled: it holds the search box + results list and reports
// wishlist changes through callbacks. In the design sandbox a bundled mock
// answers /api/crops, so typing a plant name returns real results.

export function Empty() {
  return (
    <div className="w-96">
      <PlantSearch wishlistIds={[]} />
    </div>
  )
}

export function WithWishlist() {
  // Seeded wishlist ids resolve to chips via the mock crop lookup.
  return (
    <div className="w-96">
      <PlantSearch wishlistIds={["tomato", "basil", "marigold"]} />
    </div>
  )
}

export function Interactive() {
  const [ids, setIds] = useState<string[]>(["tomato"])
  const [inspired, setInspired] = useState<string[]>(["sunflower"])
  return (
    <div className="w-96">
      <PlantSearch
        wishlistIds={ids}
        onAdd={(id) => setIds((p) => [...p, id])}
        onRemove={(id) => setIds((p) => p.filter((x) => x !== id))}
        onClearAll={() => setIds([])}
        initialQuery="bas"
        inspirationIds={inspired}
        onInspire={(id) => setInspired((p) => [...p, id])}
        onUninspire={(id) => setInspired((p) => p.filter((x) => x !== id))}
      />
    </div>
  )
}
