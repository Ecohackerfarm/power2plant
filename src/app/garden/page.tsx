'use client'
import { useRef } from 'react'
import Link from 'next/link'
import { MyGarden } from '@/components/my-garden'
import { AddBedForm } from '@/components/add-bed-form'
import { AuthPanel } from '@/components/auth-panel'
import { useSession } from '@/lib/auth-client'

export default function GardenPage() {
  const { data: session, isPending } = useSession()
  const myGardenRef = useRef<{ refresh: () => void }>(null)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← power2plant</Link>
          <h1 className="text-3xl font-bold mt-2">My Garden</h1>
          <p className="text-muted-foreground mt-1">Manage your saved garden beds.</p>
        </div>
        <AuthPanel />
      </div>

      {!isPending && !session && (
        <p className="text-sm text-muted-foreground">
          Sign in to manage your garden beds.
        </p>
      )}

      {session && (
        <>
          <AddBedForm onSaved={() => myGardenRef.current?.refresh()} />
          <MyGarden ref={myGardenRef} />
        </>
      )}
    </main>
  )
}
