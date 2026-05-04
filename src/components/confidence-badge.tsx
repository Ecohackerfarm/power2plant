'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const LEVELS: { key: string; label: string; description: string }[] = [
  {
    key: 'peer-reviewed',
    label: 'Peer-Reviewed',
    description: 'Confirmed by peer-reviewed scientific research. Highest reliability.',
  },
  {
    key: 'observed',
    label: 'Observed',
    description: 'Supported by structured field observation or multiple independent reports.',
  },
  {
    key: 'traditional',
    label: 'Traditional',
    description: 'Passed down through gardening tradition. Widely practiced but not formally studied.',
  },
  {
    key: 'anecdotal',
    label: 'Anecdotal',
    description: 'Based on individual gardener reports or folk wisdom. Treat as a starting point.',
  },
]

interface ConfidenceBadgeProps {
  level: string
  className?: string
}

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  const [open, setOpen] = useState(false)

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
        {level}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[9]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-full left-0 mb-2 w-72 bg-popover border rounded-lg shadow-lg p-3 z-10 text-left">
            <p className="text-xs font-semibold mb-2 text-foreground">Confidence levels</p>
            <ul className="space-y-1.5">
              {LEVELS.map(({ key, label, description }) => (
                <li
                  key={key}
                  className={cn('text-xs', key === level ? 'text-foreground' : 'text-muted-foreground')}
                >
                  <span className={cn('font-medium', key === level && 'underline')}>{label}</span>
                  {' — '}
                  {description}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </span>
  )
}
