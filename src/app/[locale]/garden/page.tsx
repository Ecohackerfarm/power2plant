'use client'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { MyGarden } from '@/components/my-garden'
import { AddBedForm } from '@/components/add-bed-form'
import { AuthPanel } from '@/components/auth-panel'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { useSession } from '@/lib/auth-client'

export default function GardenPage() {
  const t = useTranslations('GardenPage')
  const { data: session, isPending } = useSession()
  const myGardenRef = useRef<{ refresh: () => void }>(null)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            {t('backHome')}
          </Link>
          <h1 className="text-3xl font-bold mt-2">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <AuthPanel />
        </div>
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
