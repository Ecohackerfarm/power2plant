'use client'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { MyGarden } from '@/components/my-garden'
import { AddBedForm } from '@/components/add-bed-form'
import { useSession } from '@/lib/auth-client'

export default function GardenPage() {
  const t = useTranslations('GardenPage')
  const { data: session, isPending } = useSession()
  const myGardenRef = useRef<{ refresh: () => void }>(null)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {!isPending && !session && (
        <p className="text-sm text-muted-foreground">{t('signInPrompt')}</p>
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
