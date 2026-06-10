'use client'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'
import { FeedbackButton } from '@/components/feedback-button'
import { Menu, X, ChevronDown } from 'lucide-react'

const NAV_ITEMS = [
  { key: 'lookup' as const, href: '/relationships' },
  { key: 'plan' as const, href: '/plan' },
  { key: 'garden' as const, href: '/garden' },
] satisfies { key: 'lookup' | 'plan' | 'garden'; href: string }[]

const ADMIN_ITEMS = [
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/research-requests', label: 'Research Requests' },
  { href: '/admin/research-queue', label: 'Research Queue' },
  { href: '/admin/settings', label: 'Settings' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/relationships') {
    return pathname.startsWith('/relationships') || pathname.startsWith('/plants')
  }
  return pathname === href || pathname.startsWith(href + '/')
}

function menuItemClass(active: boolean) {
  const base = 'block px-4 py-2 text-sm rounded transition-colors'
  return active
    ? `${base} font-semibold text-foreground bg-accent`
    : `${base} text-muted-foreground hover:text-foreground hover:bg-muted`
}

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations('Nav')
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(() => pathname.startsWith('/admin'))
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center relative">

        {/* Left: hamburger + dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-background border rounded-xl shadow-lg py-1 overflow-hidden">
              {NAV_ITEMS.map(({ key, href }) => (
                <Link
                  key={key}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={menuItemClass(isActive(pathname, href))}
                >
                  {t(key)}
                </Link>
              ))}

              {isAdmin && (
                <>
                  <div className="border-t my-1" />
                  <button
                    onClick={() => setAdminOpen(o => !o)}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded"
                  >
                    {t('admin')}
                    <ChevronDown size={14} className={`transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {adminOpen && ADMIN_ITEMS.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className={`pl-8 ${menuItemClass(isActive(pathname, href))}`}
                    >
                      {label}
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Center: logo + name — absolute for true centering */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
          <Link href="/" className="flex items-center gap-2 pointer-events-auto" onClick={() => setMenuOpen(false)}>
            <Image src="/logo.png" alt="" width={32} height={32} />
            <span className="font-semibold text-sm">power2plant</span>
          </Link>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3 ml-auto">
          <FeedbackButton />
          <LocaleSwitcher />
          <AuthPanel />
        </div>
      </div>
    </header>
  )
}
