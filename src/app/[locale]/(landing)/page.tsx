'use client'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, ChevronLeft, ChevronRight, Leaf, LayoutGrid, Search, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from '@/i18n/navigation'

type SlideTheme = {
  id: 'explore' | 'plan' | 'evaluate' | 'community'
  href: string
  Icon: LucideIcon
  accent: string
  underline: string
  primaryBg: string
  primaryText: string
  cardBg: string
  iconBg: string
  iconColor: string
}

const SLIDES: SlideTheme[] = [
  {
    id: 'explore',
    href: '/relationships',
    Icon: Search,
    accent: '#2D4A3E',
    underline: '#7BAE7F',
    primaryBg: '#2D4A3E',
    primaryText: '#FFFFFF',
    cardBg: '#EDE8DC',
    iconBg: '#DCE6D6',
    iconColor: '#2D4A3E',
  },
  {
    id: 'plan',
    href: '/plan',
    Icon: LayoutGrid,
    accent: '#C96A3A',
    underline: '#C96A3A',
    primaryBg: '#C96A3A',
    primaryText: '#FFFFFF',
    cardBg: '#F6E7D8',
    iconBg: '#F1D6C3',
    iconColor: '#C96A3A',
  },
  {
    id: 'evaluate',
    href: '/garden',
    Icon: Leaf,
    accent: '#2D4A3E',
    underline: '#7BAE7F',
    primaryBg: '#8FBF93',
    primaryText: '#2D4A3E',
    cardBg: '#D6EAF0',
    iconBg: '#C2DBE2',
    iconColor: '#2D4A3E',
  },
  {
    id: 'community',
    href: '/contribute',
    Icon: Users,
    accent: '#2D4A3E',
    underline: '#7BAE7F',
    primaryBg: '#2D4A3E',
    primaryText: '#FFFFFF',
    cardBg: '#EDE8DC',
    iconBg: '#EAD3C6',
    iconColor: '#2D4A3E',
  },
]

const AUTO_ADVANCE_MS = 8000

const serif = { fontFamily: 'var(--font-fraunces), ui-serif, serif' }

function Underline({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 260 12"
      className="mt-2 h-3 w-56"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path d="M4 8C70 2 190 2 256 6" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export default function LandingPage() {
  const t = useTranslations('Landing')
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const slide = SLIDES[active]

  const goTo = useCallback((index: number) => {
    const len = SLIDES.length
    const next = (index + len) % len
    setDirection(next === (active - 1 + len) % len ? 'prev' : 'next')
    setActive(next)
    setPaused(true)
  }, [active])

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => {
      setDirection('next')
      setActive((current) => (current + 1) % SLIDES.length)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(timer)
  }, [paused])

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <div data-intro-fade className="relative z-10 mx-auto max-w-5xl">
        {/* Heading — changes with the active slide, sits above the carousel */}
        <div className="mb-8 flex flex-col items-center py-6 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: slide.accent }}
          >
            {t('eyebrow')}
          </p>
          <h1 className="text-5xl font-bold leading-tight text-[#2D4A3E] sm:text-6xl" style={serif}>
            {t(`slides.${slide.id}.heading`)}
          </h1>
          <Underline color={slide.underline} />
        </div>

        {/* Tab pills double as carousel navigation — stack on mobile, row when they fit */}
        <div role="tablist" className="mb-8 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
          {SLIDES.map((s, index) => {
            const isActive = index === active
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => goTo(index)}
                className={`w-full rounded-full px-4 py-2 text-center text-sm font-medium transition-colors sm:w-auto ${
                  isActive
                    ? 'bg-[#2D4A3E] text-white'
                    : 'bg-[#2D4A3E]/10 text-[#5A6E60] hover:bg-[#2D4A3E]/20'
                }`}
              >
                {t(`slides.${s.id}.tab`)}
              </button>
            )
          })}
        </div>

        {/* Carousel card */}
        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <button
            type="button"
            onClick={() => goTo(active - 1)}
            aria-label={t('previous')}
            className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-[#2D4A3E]/30 bg-[#F7F3E8] p-2 text-[#2D4A3E] transition-colors hover:bg-white md:-left-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(active + 1)}
            aria-label={t('next')}
            className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-[#2D4A3E]/30 bg-[#F7F3E8] p-2 text-[#2D4A3E] transition-colors hover:bg-white md:-right-2"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div
            key={slide.id}
            className={`mx-auto flex min-h-[19rem] max-w-4xl flex-col rounded-3xl p-8 sm:min-h-[17rem] sm:p-12 ${
              direction === 'prev' ? 'animate-slide-in-left' : 'animate-slide-in-right'
            }`}
            style={{ backgroundColor: slide.cardBg }}
          >
            <div
              className="mb-6 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: slide.iconBg }}
            >
              <slide.Icon className="h-6 w-6" style={{ color: slide.iconColor }} />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#5A6E60]">
              {t(`slides.${slide.id}.tab`)}
            </p>
            <p className="max-w-xl text-base leading-relaxed text-[#5A6E60]">
              {t(`slides.${slide.id}.description`)}
            </p>
            <Link
              href={slide.href}
              className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold"
              style={{ color: slide.accent }}
            >
              {t(`slides.${slide.id}.cta`)} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Pagination dots */}
        <div className="mt-8 flex justify-center gap-2">
          {SLIDES.map((s, index) => {
            const isActive = index === active
            return (
              <button
                key={s.id}
                onClick={() => goTo(index)}
                aria-label={t(`slides.${s.id}.tab`)}
                className={`h-2 rounded-full transition-all ${
                  isActive ? 'w-6 bg-[#2D4A3E]' : 'w-2 bg-[#2D4A3E]/25 hover:bg-[#2D4A3E]/40'
                }`}
              />
            )
          })}
        </div>
      </div>
    </main>
  )
}
