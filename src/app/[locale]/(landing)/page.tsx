'use client'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'

const CARDS = [
  { titleKey: 'lookupTitle', descKey: 'lookupDesc', href: '/relationships', icon: '🔍' },
  { titleKey: 'planTitle', descKey: 'planDesc', href: '/plan', icon: '🛏' },
  { titleKey: 'gardenTitle', descKey: 'gardenDesc', href: '/garden', icon: '🌱' },
] as const

export default function LandingPage() {
  const t = useTranslations('Landing')
  return (
    <main className="min-h-screen bg-[#F7F3E8] px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-end items-center gap-3 mb-8">
          <LocaleSwitcher />
          <AuthPanel />
        </div>
        <div className="flex flex-col items-center text-center mb-16 py-10">
          <Image src="/logo.png" alt="" width={72} height={72} className="mb-6" />
          <h1 className="text-5xl font-bold text-[#2D4A3E] mb-4" style={{ fontFamily: 'var(--font-fraunces), ui-serif, serif' }}>
            {t('title')}
          </h1>
          <p className="text-lg text-[#5A6E60] max-w-md leading-relaxed">{t('subtitle')}</p>
          <div className="flex gap-3 mt-8 flex-wrap justify-center">
            <Link
              href="/relationships"
              className="px-6 py-3 rounded-full bg-[#C96A3A] text-white font-semibold text-sm hover:bg-[#b85d30] transition-colors shadow-sm"
            >
              {t('lookupTitle')}
            </Link>
            <Link
              href="/plan"
              className="px-6 py-3 rounded-full border-2 border-[#2D4A3E] text-[#2D4A3E] font-semibold text-sm hover:bg-[#EDE8DC] transition-colors"
            >
              {t('planTitle')}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {CARDS.map(({ titleKey, descKey, href, icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-2xl border border-[#EDE8DC] bg-white p-6 hover:-translate-y-1 hover:border-[#7BAE7F] hover:shadow-md transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-full bg-[#D6EAF0] flex items-center justify-center text-2xl">
                {icon}
              </div>
              <h2 className="text-lg font-semibold text-[#2D4A3E]" style={{ fontFamily: 'var(--font-fraunces), ui-serif, serif' }}>
                {t(titleKey)}
              </h2>
              <p className="text-sm text-[#5A6E60] leading-relaxed flex-1">{t(descKey)}</p>
              <span className="text-sm font-medium text-[#7BAE7F] group-hover:underline">
                {t(titleKey)} →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
