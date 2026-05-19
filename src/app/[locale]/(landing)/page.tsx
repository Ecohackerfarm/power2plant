'use client'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'

const CARDS = [
  { titleKey: 'lookupTitle', descKey: 'lookupDesc', href: '/relationships' },
  { titleKey: 'planTitle', descKey: 'planDesc', href: '/plan' },
  { titleKey: 'gardenTitle', descKey: 'gardenDesc', href: '/garden' },
] as const

export default function LandingPage() {
  const t = useTranslations('Landing')
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end items-center gap-3 mb-8">
          <LocaleSwitcher />
          <AuthPanel />
        </div>
        <div className="flex flex-col items-center text-center mb-12">
          <Image src="/logo.png" alt="" width={64} height={64} className="mb-4" />
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CARDS.map(({ titleKey, descKey, href }) => (
            <Link key={href} href={href} className="flex flex-col gap-2 rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
              <h2 className="font-semibold">{t(titleKey)}</h2>
              <p className="text-sm text-muted-foreground">{t(descKey)}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}