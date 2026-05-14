'use client'
import { useRef } from 'react'
import Link from 'next/link'
import { useGarden } from '@/hooks/use-garden'
import { PlantSearch } from '@/components/plant-search'
import { MyGarden } from '@/components/my-garden'
import { useSession } from '@/lib/auth-client'

export default function GardenPage() {
  const { data: session } = useSession()
  const { state, addToWishlist, removeFromWishlist, clearWishlist } = useGarden()
  const myGardenRef = useRef<{ refresh: () => void }>(null)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← power2plant</Link>
        <h1 className="text-3xl font-bold mt-2">My Garden</h1>
        <p className="text-muted-foreground mt-1">
          Manage your plant wishlist and saved garden plans.
        </p>
      </div>

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
        onClearAll={clearWishlist}
      />

      {session && (
        <MyGarden ref={myGardenRef} />
      )}
    </main>
  )
}