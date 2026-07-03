// design-sync wrappers for power2plant's stateful feature components.
//
// PlantSearch and RecommendationDisplay are real app components, not UI
// primitives: they read locale/translations (next-intl), a session, and live
// data. The converter resolves their `@/i18n/navigation` and `@/lib/auth-client`
// imports to the shims in ./shims (via .design-sync/tsconfig.shim.json), and
// ./shims/install-fetch mocks `/api/crops`. Here we additionally wrap each
// export in NextIntlClientProvider (the only piece a host normally mounts
// app-wide) and default the required props so the component renders standalone
// in the design tool. The real prop contract is still published in the .d.ts;
// callers override any default. See conventions.md for the production wiring.
import * as React from 'react'
import { NextIntlClientProvider } from 'next-intl'
import './shims/install-fetch'
import messages from './shims/messages.json'
import { PlantSearch as RawPlantSearch } from '../src/components/plant-search'
import { RecommendationDisplay as RawRecommendationDisplay } from '../src/components/recommendation-display'
import type { RecommendResult } from '../src/lib/recommend'

function DesignProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  )
}

type PlantSearchProps = React.ComponentProps<typeof RawPlantSearch>

export function PlantSearch(props: Partial<PlantSearchProps>) {
  const withDefaults: PlantSearchProps = {
    wishlistIds: [],
    onAdd: () => {},
    onRemove: () => {},
    onClearAll: () => {},
    ...props,
  }
  return (
    <DesignProviders>
      <RawPlantSearch {...withDefaults} />
    </DesignProviders>
  )
}

// A realistic companion-planting result so the component renders a full,
// on-brand surface when dropped in with no props. Callers pass their own
// `result` (and `alternatives`) computed from the recommend engine.
const SAMPLE_RESULT: RecommendResult = {
  beds: [
    {
      index: 0,
      crops: [
        { id: 'tomato', name: 'tomato', botanicalName: 'Solanum lycopersicum', minTempC: 10, commonNames: ['tomato'] },
        { id: 'basil', name: 'basil', botanicalName: 'Ocimum basilicum', minTempC: 12, commonNames: ['basil'] },
        { id: 'marigold', name: 'marigold', botanicalName: 'Tagetes patula', minTempC: 8, commonNames: ['french marigold'] },
      ],
      hints: [
        { cropAId: 'tomato', cropBId: 'basil', pairLabel: 'Tomato & Basil', details: 'pest control', confidenceLevel: 'observed' },
        { cropAId: 'tomato', cropBId: 'marigold', pairLabel: 'Tomato & Marigold', details: 'repels pests', confidenceLevel: 'traditional' },
      ],
      noDataPairs: [{ cropAId: 'basil', cropBId: 'marigold', pairLabel: 'Basil & Marigold' }],
    },
    {
      index: 1,
      crops: [
        { id: 'carrot', name: 'carrot', botanicalName: 'Daucus carota', minTempC: 4, commonNames: ['carrot'] },
        { id: 'onion', name: 'onion', botanicalName: 'Allium cepa', minTempC: 2, commonNames: ['onion'] },
      ],
      hints: [
        { cropAId: 'carrot', cropBId: 'onion', pairLabel: 'Carrot & Onion', details: 'natural repellent', confidenceLevel: 'peer-reviewed' },
      ],
      noDataPairs: [],
    },
    {
      index: 2,
      crops: [
        { id: 'bean', name: 'bush bean', botanicalName: 'Phaseolus vulgaris', minTempC: 10, commonNames: ['bush bean'] },
        { id: 'nasturtium', name: 'nasturtium', botanicalName: 'Tropaeolum majus', minTempC: 8, commonNames: ['nasturtium'] },
      ],
      hints: [
        { cropAId: 'bean', cropBId: 'nasturtium', pairLabel: 'Bush Bean & Nasturtium', details: 'trap crop', confidenceLevel: 'traditional' },
      ],
      noDataPairs: [],
    },
  ],
  overflow: [],
  conflicts: [],
  duplicatedCropIds: [],
}

type RecommendationDisplayProps = React.ComponentProps<typeof RawRecommendationDisplay>

export function RecommendationDisplay(props: Partial<RecommendationDisplayProps>) {
  const withDefaults: RecommendationDisplayProps = {
    result: SAMPLE_RESULT,
    alternatives: [],
    ...props,
  }
  return (
    <DesignProviders>
      <RawRecommendationDisplay {...withDefaults} />
    </DesignProviders>
  )
}
