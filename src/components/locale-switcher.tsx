'use client'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { useLocale } from 'next-intl'

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  de: 'DE',
  es: 'ES',
  fr: 'FR',
  pt: 'PT',
  'zh-Hans': '中文',
  ar: 'AR',
  hi: 'HI',
  ru: 'RU',
  ja: '日本語',
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next })
  }

  return (
    <select
      value={locale}
      onChange={(e) => switchLocale(e.target.value)}
      className="text-sm bg-transparent border-none cursor-pointer text-[#F7F3E8]/70 hover:text-[#F7F3E8] focus:outline-none"
      aria-label="Language"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l] ?? l.toUpperCase()}
        </option>
      ))}
    </select>
  )
}
