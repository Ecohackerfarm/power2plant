'use client'
import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

const LEVEL_KEYS = ['peerReviewed', 'observed', 'traditional', 'anecdotal'] as const
type LevelKey = typeof LEVEL_KEYS[number]

const LEVEL_KEY_MAP: Record<string, LevelKey> = {
  'peer-reviewed': 'peerReviewed',
  'observed': 'observed',
  'traditional': 'traditional',
  'anecdotal': 'anecdotal',
}

interface ConfidenceBadgeProps {
  level: string
  className?: string
}

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  const [open, setOpen] = useState(false)
  const [popupStyle, setPopupStyle] = useState<{ bottom: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const t = useTranslations('ConfidenceBadge')
  const levelKey: LevelKey = LEVEL_KEY_MAP[level] ?? 'anecdotal'

  function handleClick() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopupStyle({
        bottom: window.innerHeight - rect.top + 8,
        left: Math.min(rect.left, window.innerWidth - 288 - 8),
      })
    }
    setOpen(o => !o)
  }

  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        className={cn(
          'underline decoration-dotted underline-offset-2 cursor-pointer',
          className,
        )}
        aria-expanded={open}
      >
        {t(levelKey)}
      </button>

      {open && popupStyle && (
        <>
          <div
            className="fixed inset-0 z-[9]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="fixed w-72 bg-popover border rounded-lg shadow-lg p-3 z-10 text-start"
            style={{ bottom: popupStyle.bottom, left: popupStyle.left }}
          >
            <p className="text-xs font-semibold mb-2 text-foreground">{t('title')}</p>
            <ul className="space-y-1.5">
              {LEVEL_KEYS.map(key => (
                <li
                  key={key}
                  className={cn('text-xs', key === levelKey ? 'text-foreground' : 'text-muted-foreground')}
                >
                  <span className={cn('font-medium', key === levelKey && 'underline')}>
                    {t(`${key}Label`)}
                  </span>
                  {' — '}
                  {t(`${key}Desc`)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </span>
  )
}
