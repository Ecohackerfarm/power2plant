'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Image from 'next/image'

// Shared decorative backdrop: four corner plants + the brand centerpiece, faded
// behind the page content on every route. On the landing page the layout's
// pre-paint script sets html[data-intro="running"], which we read here to play
// the one-time intro (staggered slide/grow + fade). On every other page there is
// no such attribute, so this simply renders the settled background.

// STAGGER: gap between corner reveals. OPACITY: how fast each piece fades in —
// kept shorter than SLIDE so the slide/grow stays visible. SLIDE: corner
// slide+scale duration. CENTER_FADE: centerpiece fade. PAUSE: hold at full color
// before settling. FINAL: resting opacity (matches the decor classes).
const INTRO = { STAGGER: 240, OPACITY: 360, SLIDE: 780, CENTER_FADE: 620, PAUSE: 700, FINAL: 0.3 }

// Each corner slides in diagonally from its own corner and grows into place.
// Index = reveal order: top-left, bottom-left, top-right, bottom-right.
const CORNER_FX: Record<number, { dx: number; dy: number; origin: string }> = {
  0: { dx: -1, dy: -1, origin: 'top left' },
  1: { dx: -1, dy:  1, origin: 'bottom left' },
  2: { dx:  1, dy: -1, origin: 'top right' },
  3: { dx:  1, dy:  1, origin: 'bottom right' },
}
const SLIDE_PX = 64

type Stage = 'pre' | 'decor' | 'center' | 'settled'

export function SiteBackground() {
  const [animating, setAnimating] = useState(false)
  const [stage, setStage] = useState<Stage>('settled')

  useEffect(() => {
    if (document.documentElement.getAttribute('data-intro') !== 'running') return
    const cornersDone = 3 * INTRO.STAGGER + INTRO.SLIDE
    const settleAt = cornersDone + INTRO.CENTER_FADE + INTRO.PAUSE
    const timers: ReturnType<typeof setTimeout>[] = []
    setAnimating(true)
    setStage('pre')
    const raf = requestAnimationFrame(() => setStage('decor'))
    timers.push(setTimeout(() => setStage('center'), cornersDone))
    timers.push(setTimeout(() => {
      setStage('settled')
      document.documentElement.removeAttribute('data-intro')
      try { sessionStorage.setItem('hgIntroSeen', '1') } catch { /* ignore */ }
    }, settleAt))
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout) }
  }, [])

  // Inline style for an animated piece. `corner` 0-3 = a corner plant (staggered);
  // null = the centerpiece (revealed after the corners). When not animating we
  // return undefined so each element keeps its resting opacity class.
  const fxStyle = (corner: number | null): CSSProperties | undefined => {
    if (!animating) return undefined
    const isCenter = corner === null
    const opacity =
      stage === 'settled' ? INTRO.FINAL
      : stage === 'pre' ? 0
      : isCenter ? (stage === 'center' ? 1 : 0)
      : 1
    const transitionDelay = stage === 'decor' && !isCenter ? `${corner! * INTRO.STAGGER}ms` : '0ms'
    if (isCenter) {
      return { opacity, transition: `opacity ${INTRO.CENTER_FADE}ms ease`, transitionDelay }
    }
    const fx = CORNER_FX[corner!]
    const offset = stage === 'pre'
    return {
      opacity,
      transform: offset
        ? `translate(${fx.dx * SLIDE_PX}px, ${fx.dy * SLIDE_PX}px) scale(0.7)`
        : 'translate(0, 0) scale(1)',
      transformOrigin: fx.origin,
      // Fade resolves faster than the slide/scale so the movement reads clearly.
      transition: `opacity ${INTRO.OPACITY}ms ease, transform ${INTRO.SLIDE}ms cubic-bezier(0.16, 0.8, 0.34, 1)`,
      transitionDelay,
    }
  }

  return (
    <>
      {/* Intro white wash — covers the page during the intro, fades out at settle */}
      <div data-intro-white aria-hidden="true" className="fixed inset-0 z-0 bg-white" />

      {/* Brand centerpiece — faded backdrop (revealed last during the intro) */}
      <Image
        src="/center.png"
        alt=""
        width={1100}
        height={733}
        priority
        aria-hidden="true"
        data-intro-fx
        style={fxStyle(null)}
        className="pointer-events-none fixed left-1/2 top-1/2 z-[1] h-auto w-[min(125vw,820px)] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.14] md:w-[min(80vw,760px)] md:opacity-30"
      />

      {/* Corner plants — desktop only. Reveal order: TL, BL, TR, BR. */}
      <Image
        src="/deco_left-2.png"
        alt=""
        width={596}
        height={715}
        priority
        aria-hidden="true"
        data-intro-fx
        style={fxStyle(0)}
        className="pointer-events-none fixed left-0 top-0 z-[1] hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
      <Image
        src="/deco_left.png"
        alt=""
        width={495}
        height={456}
        aria-hidden="true"
        data-intro-fx
        style={fxStyle(1)}
        className="pointer-events-none fixed bottom-0 left-0 z-[1] hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
      <Image
        src="/deco_right-2.png"
        alt=""
        width={540}
        height={708}
        aria-hidden="true"
        data-intro-fx
        style={fxStyle(2)}
        className="pointer-events-none fixed right-0 top-0 z-[1] hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
      <Image
        src="/deco_right.png"
        alt=""
        width={462}
        height={514}
        aria-hidden="true"
        data-intro-fx
        style={fxStyle(3)}
        className="pointer-events-none fixed bottom-0 right-0 z-[1] hidden h-auto w-[clamp(180px,22vw,340px)] select-none opacity-30 md:block"
      />
    </>
  )
}
