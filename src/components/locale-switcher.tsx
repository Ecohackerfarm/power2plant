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

export function LocaleSwitcher({ variant = 'header' }: { variant?: 'header' | 'menu' }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next })
  }

  const className =
    variant === 'menu'
      ? 'w-full bg-transparent border border-[#EDE8DC] rounded-lg px-3 py-2 text-sm text-[#2D4A3E] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#7BAE7F]'
      : 'text-sm bg-transparent border-none cursor-pointer text-[#F7F3E8]/70 hover:text-[#F7F3E8] focus:outline-none'

  return (
    <select
      value={locale}
      onChange={(e) => switchLocale(e.target.value)}
      className={className}
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
