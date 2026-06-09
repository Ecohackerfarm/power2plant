'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TopUpModal } from '@/components/top-up-modal'

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

type Props = {
  cropAName: string
  cropBName: string
  cropAId: string
  cropBId: string
}

export function ResearchFundButton({ cropAName, cropBName }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!STRIPE_PK) {
    return (
      <Button variant="outline" size="sm" disabled title="Payment provider not yet configured">
        Fund research
      </Button>
    )
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setModalOpen(true)}
        aria-label={`Fund research for ${cropAName} & ${cropBName}`}
      >
        Fund research
      </Button>

      {modalOpen && (
        <TopUpModal onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
