'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TopUpModal } from '@/components/top-up-modal'
import { ExternalLink } from 'lucide-react'

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const KOFI_BASE = process.env.NEXT_PUBLIC_KOFI_URL?.startsWith('https://')
  ? process.env.NEXT_PUBLIC_KOFI_URL : undefined

type Props = {
  cropAName: string
  cropBName: string
  cropAId: string
  cropBId: string
}

export function ResearchFundButton({ cropAName, cropBName, cropAId, cropBId }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  const pairKey = cropAId < cropBId ? `${cropAId}-${cropBId}` : `${cropBId}-${cropAId}`

  return (
    <>
      {KOFI_BASE && (
        <a
          href={`${KOFI_BASE}?utm_campaign=research&utm_content=${pairKey}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Publicly fund research for ${cropAName} & ${cropBName} via Ko-fi`}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted transition-colors"
        >
          Ko-fi
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {STRIPE_PK ? (
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          aria-label={`Fund research for ${cropAName} & ${cropBName}`}
        >
          Fund research
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled title="Payment provider not yet configured">
          Fund research
        </Button>
      )}

      {modalOpen && (
        <TopUpModal onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
