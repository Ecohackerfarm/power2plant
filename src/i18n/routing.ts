import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'de', 'es', 'fr', 'pt', 'zh-Hans', 'ar', 'hi', 'ru', 'ja'],
  defaultLocale: 'en',
})

export const RTL_LOCALES: ReadonlySet<string> = new Set(['ar'])

export type Locale = (typeof routing.locales)[number]
