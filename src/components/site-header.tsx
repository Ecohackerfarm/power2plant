'use client'
import { useState } from 'react'
import Image from 'next/image'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'
import { FeedbackButton } from '@/components/feedback-button'
import { Menu, X } from 'lucide-react'

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

function navClass(active: boolean, mobile = false) {
  const base = `text-sm transition-colors rounded ${mobile ? 'px-3 py-2' : 'px-3 py-1.5'}`
  return active
    ? `${base} font-semibold text-foreground ${mobile ? 'bg-accent' : 'underline decoration-primary decoration-2 underline-offset-4'}`
    : `${base} text-muted-foreground hover:text-foreground ${mobile ? 'hover:bg-accent' : ''}`
}

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations('Nav')
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="" width={32} height={32} />
          <span className="font-semibold text-sm">power2plant</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1 flex-wrap">
          {NAV_ITEMS.map(({ key, href }) => (
            <Link key={key} href={href} className={navClass(isActive(pathname, href))}>
              {t(key)}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" className={navClass(isActive(pathname, '/admin'))}>
              {t('admin')}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3 ml-auto md:ml-0 shrink-0">
          <FeedbackButton />
          <LocaleSwitcher />
          <AuthPanel />
          <button
            className="md:hidden p-1.5 rounded text-muted-foreground hover:text-foreground"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="md:hidden border-t px-4 py-3 flex flex-col gap-1 bg-background">
          {NAV_ITEMS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={navClass(isActive(pathname, href), true)}
            >
              {t(key)}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className={navClass(isActive(pathname, '/admin'), true)}
            >
              {t('admin')}
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}
