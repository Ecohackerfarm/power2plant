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
  const base = 'block px-4 py-2 text-sm rounded-lg transition-colors'
  return active
    ? `${base} font-semibold text-[#2D4A3E] bg-[#D6EAF0]`
    : `${base} text-[#5A6E60] hover:text-[#2D4A3E] hover:bg-[#EDE8DC]`
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
    <header className="border-b bg-[#2D4A3E] text-[#F7F3E8] sticky top-0 z-40 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center relative">

        {/* Left: hamburger + dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1.5 rounded text-[#F7F3E8]/70 hover:text-[#F7F3E8] transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-[#F7F3E8] border border-[#EDE8DC] rounded-2xl shadow-lg py-1 overflow-hidden">
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
            </div>
          )}
        </div>

        {/* Center: logo + name — absolute for true centering */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
          <Link href="/" className="flex items-center gap-2 pointer-events-auto" onClick={() => setMenuOpen(false)}>
            <Image src="/logo.png" alt="" width={32} height={32} />
            <span className="font-semibold text-sm text-[#F7F3E8]" style={{ fontFamily: 'var(--font-fraunces), ui-serif, serif', fontWeight: 300 }}>power2plant</span>
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
