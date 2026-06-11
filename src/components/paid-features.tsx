'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PaidFeatures() {
  const t = useTranslations('PaidFeatures')

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-amber-900">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
          <li>{t('moreBeds')}</li>
        </ul>
        <Link
          href="/account"
          className="inline-block text-sm font-medium text-amber-900 underline hover:no-underline mt-1"
        >
          {t('topUp')}
        </Link>
      </CardContent>
    </Card>
  )
}
