'use client'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

type Props = {
  cropAName: string
  cropBName: string
  // TODO (#193): replace with real payment URL once provider is chosen (Stripe / Ko-fi)
  paymentUrl?: string
}

export function ResearchFundButton({ cropAName, cropBName, paymentUrl }: Props) {
  if (!paymentUrl) {
    return (
      <Button variant="outline" size="sm" disabled title="Payment provider not yet configured">
        Fund research
      </Button>
    )
  }

  return (
    <a
      href={paymentUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Fund research for ${cropAName} & ${cropBName}`}
      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
    >
      Fund research
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}
