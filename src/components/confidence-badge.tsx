'use client'
import { useState } from 'react'
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
  const t = useTranslations('ConfidenceBadge')
  const levelKey: LevelKey = LEVEL_KEY_MAP[level] ?? 'anecdotal'

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'underline decoration-dotted underline-offset-2 cursor-pointer',
          className,
        )}
        aria-expanded={open}
      >
        {t(levelKey)}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[9]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-full start-0 mb-2 w-72 bg-popover border rounded-lg shadow-lg p-3 z-10 text-start">
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
