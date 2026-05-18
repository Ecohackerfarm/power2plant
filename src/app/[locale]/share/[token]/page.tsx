import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Plant {
  id: string
  name: string
  botanicalName: string
}

interface BedSnapshot {
  name: string
  plants: Plant[]
}

export default async function SharePage({ params }: { params: Promise<{ token: string; locale: string }> }) {
  const { token } = await params
  const t = await getTranslations('SharePage')
  const share = await prisma.gardenShare.findUnique({ where: { token } })

  if (!share || share.expiresAt < new Date()) {
    notFound()
  }

  const beds = share.beds as unknown as BedSnapshot[]

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          {t('backHome')}
        </Link>
        <h1 className="text-3xl font-bold mt-2">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('subtitle', { date: share.expiresAt.toLocaleDateString() })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {beds.map((bed) => (
          <Card key={bed.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{bed.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {bed.plants.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('emptyBed')}</p>
              ) : (
                <ul className="space-y-1">
                  {bed.plants.map((plant) => (
                    <li key={plant.id} className="text-sm">
                      <Link href={`/plants/${plant.id}`} className="hover:underline">
                        {plant.name}
                      </Link>
                      <span className="text-muted-foreground italic text-xs ml-1">{plant.botanicalName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
