'use client'
import { useState, useRef, useEffect } from 'react'
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
  { key: 'leaderboard' as const, href: '/leaderboard' },
] satisfies { key: 'lookup' | 'plan' | 'garden' | 'leaderboard'; href: string }[]

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
  const base = 'block px-4 py-2 text-sm rounded-lg transition-colors'
  return active
    ? `${base} font-semibold text-[#2D4A3E] bg-[#D6EAF0]`
    : `${base} text-[#5A6E60] hover:text-[#2D4A3E] hover:bg-[#EDE8DC]`
}

export function SiteHeader({ isAdmin = false, version }: { isAdmin?: boolean; version?: string }) {
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
    <>
      {/* Left: green quarter-circle corner — menu */}
      <div data-intro-fade className="fixed left-0 top-0 z-40">
        <div ref={menuRef} className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-16 w-16 rounded-br-full bg-[#2D4A3E] shadow-md"
          />
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="relative flex h-12 w-12 items-start justify-start p-3 text-[#F7F3E8]/80 hover:text-[#F7F3E8] transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {menuOpen && (
            <div className="absolute ltr:left-2 rtl:right-2 top-14 z-50 w-56 bg-[#F7F3E8] border border-[#EDE8DC] rounded-2xl shadow-lg py-1 overflow-hidden">
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
                  <div className="border-t border-[#EDE8DC] my-1" />
                  <button
                    onClick={() => setAdminOpen(o => !o)}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-[#5A6E60] hover:text-[#2D4A3E] hover:bg-[#EDE8DC] transition-colors rounded-lg"
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

              {/* Utilities pinned to the bottom of the menu */}
              <div className="border-t border-[#EDE8DC] my-1" />
              <FeedbackButton variant="menu" onOpen={() => setMenuOpen(false)} />
              <div className="px-4 py-2">
                <LocaleSwitcher variant="menu" />
              </div>
              {version && (
                <>
                  <div className="border-t border-[#EDE8DC] my-1" />
                  <div className="px-4 py-2 text-[11px] text-[#5A6E60]/60 leading-none">v{version}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: green quarter-circle corner — account */}
      <div data-intro-fade className="fixed right-0 top-0 z-40">
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-[#2D4A3E] shadow-md"
          />
          <div className="relative flex justify-end p-3">
            <AuthPanel />
          </div>
        </div>
      </div>
    </>
  )
}
