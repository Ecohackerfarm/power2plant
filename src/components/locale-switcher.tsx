'use client'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { useLocale } from 'next-intl'

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  de: 'DE',
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next })
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            l === locale
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-current={l === locale ? 'true' : undefined}
        >
          {LOCALE_LABELS[l] ?? l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
