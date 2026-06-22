'use client'
import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
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
  const slide = SLIDES[active]

  const goTo = useCallback((index: number) => {
    setActive((index + SLIDES.length) % SLIDES.length)
    setPaused(true)
  }, [])

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(timer)
  }, [paused])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7F3E8] px-4 py-8">
      {/* Fixed decorative plants — corners, behind content, non-moving */}
      <Image
        src="/deco_left-2.png"
        alt=""
        width={596}
        height={715}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-0 hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
      <Image
        src="/deco_right-2.png"
        alt=""
        width={540}
        height={708}
        aria-hidden="true"
        className="pointer-events-none fixed right-0 top-0 z-0 hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
      <Image
        src="/deco_left.png"
        alt=""
        width={384}
        height={384}
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 left-0 z-0 hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
      <Image
        src="/deco_right.png"
        alt=""
        width={384}
        height={384}
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Hero — changes with the active slide */}
        <div className="mb-12 flex flex-col items-center py-6 text-center">
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
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#5A6E60]">
            {t(`slides.${slide.id}.description`)}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={slide.href}
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: slide.primaryBg, color: slide.primaryText }}
            >
              {t(`slides.${slide.id}.cta`)} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={slide.href}
              className="inline-flex items-center rounded-full border-2 border-[#2D4A3E] px-7 py-3 text-sm font-semibold text-[#2D4A3E] transition-colors hover:bg-[#EDE8DC]"
            >
              {t('learnMore')}
            </Link>
          </div>
        </div>

        {/* Tab pills double as carousel navigation */}
        <div role="tablist" className="mb-8 flex flex-wrap justify-center gap-2">
          {SLIDES.map((s, index) => {
            const isActive = index === active
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => goTo(index)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
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
            className="mx-auto max-w-4xl animate-[fadeIn_0.4s_ease] rounded-3xl p-8 sm:p-12"
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
            <h2 className="mb-4 text-3xl text-[#2D4A3E]" style={serif}>
              {t(`slides.${slide.id}.heading`)}
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-[#5A6E60]">
              {t(`slides.${slide.id}.description`)}
            </p>
            <Link
              href={slide.href}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
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
