'use client'
import Image from 'next/image'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'
import { FeedbackButton } from '@/components/feedback-button'

const NAV_ITEMS = [
  { key: 'lookup' as const, href: '/relationships' },
  { key: 'plan' as const, href: '/plan' },
  { key: 'garden' as const, href: '/garden' },
] satisfies { key: 'lookup' | 'plan' | 'garden'; href: string }[]

function isActive(pathname: string, href: string): boolean {
  if (href === '/relationships') {
    return pathname.startsWith('/relationships') || pathname.startsWith('/plants')
  }
  return pathname === href || pathname.startsWith(href + '/')
}

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations('Nav')
  const pathname = usePathname()

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="" width={32} height={32} />
          <span className="font-semibold text-sm">power2plant</span>
        </Link>
        <nav className="flex items-center gap-1 flex-1 flex-wrap">
          {NAV_ITEMS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                isActive(pathname, href)
                  ? 'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(key)}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin/feedback"
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                isActive(pathname, '/admin')
                  ? 'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('admin')}
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <FeedbackButton />
          <LocaleSwitcher />
          <AuthPanel />
        </div>
      </div>
    </header>
  )
}