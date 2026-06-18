import type { Metadata, Viewport } from 'next'
import { DM_Sans, Fraunces } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Toaster } from 'sonner'
import { routing, RTL_LOCALES } from '@/i18n/routing'
import '../globals.css'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['300', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'power2plant',
  description: 'Companion planting garden planner',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#1C2E28',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!(routing.locales as readonly string[]).includes(locale)) notFound()

  const messages = await getMessages()

  return (
    <html lang={locale} dir={RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'}>
      <body className={`${dmSans.variable} ${fraunces.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
