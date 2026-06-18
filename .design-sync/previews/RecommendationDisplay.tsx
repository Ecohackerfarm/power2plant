import { RecommendationDisplay } from "power2plant"

// RecommendationDisplay renders a companion-planting result: one card per garden
// bed, each listing its crops, the positive companion pairs (with a confidence
// badge), and pairs that have no research data yet (an invitation to fund/vote).
// `result` defaults to a representative sample so the component renders with no
// props; pass your own arrangement from the recommend engine in production.

const crop = (id: string, name: string, botanicalName: string, minTempC: number | null) => ({
  id,
  name,
  botanicalName,
  minTempC,
  commonNames: [name],
})

export function Default() {
  // No props → the bundled sample arrangement (3 beds, hints, a no-data pair).
  return (
    <div className="max-w-4xl">
      <RecommendationDisplay />
    </div>
  )
}

export function WithAlternatives() {
  const primary = {
    beds: [
      {
        index: 0,
        crops: [crop("tomato", "tomato", "Solanum lycopersicum", 10), crop("basil", "basil", "Ocimum basilicum", 12)],
        hints: [
          { cropAId: "tomato", cropBId: "basil", pairLabel: "Tomato & Basil", details: "pest control", confidenceLevel: "observed" },
        ],
        noDataPairs: [],
      },
      {
        index: 1,
        crops: [crop("carrot", "carrot", "Daucus carota", 4), crop("onion", "onion", "Allium cepa", 2)],
        hints: [
          { cropAId: "carrot", cropBId: "onion", pairLabel: "Carrot & Onion", details: "natural repellent", confidenceLevel: "peer-reviewed" },
        ],
        noDataPairs: [],
      },
    ],
    overflow: [],
    conflicts: [],
    duplicatedCropIds: [],
  }
  const alt = {
    beds: [
      {
        index: 0,
        crops: [crop("tomato", "tomato", "Solanum lycopersicum", 10), crop("carrot", "carrot", "Daucus carota", 4)],
        hints: [
          { cropAId: "tomato", cropBId: "carrot", pairLabel: "Tomato & Carrot", details: "space sharing", confidenceLevel: "traditional" },
        ],
        noDataPairs: [],
      },
      {
        index: 1,
        crops: [crop("basil", "basil", "Ocimum basilicum", 12), crop("onion", "onion", "Allium cepa", 2)],
        hints: [],
        noDataPairs: [{ cropAId: "basil", cropBId: "onion", pairLabel: "Basil & Onion" }],
      },
    ],
    overflow: [],
    conflicts: [],
    duplicatedCropIds: [],
  }
  return (
    <div className="max-w-4xl">
      <RecommendationDisplay result={primary} alternatives={[alt]} />
    </div>
  )
}

export function WithConflictsAndOverflow() {
  const result = {
    beds: [
      {
        index: 0,
        crops: [crop("tomato", "tomato", "Solanum lycopersicum", 10), crop("basil", "basil", "Ocimum basilicum", 12)],
        hints: [
          { cropAId: "tomato", cropBId: "basil", pairLabel: "Tomato & Basil", details: "pest control", confidenceLevel: "observed" },
        ],
        noDataPairs: [],
      },
    ],
    overflow: [crop("cucumber", "cucumber", "Cucumis sativus", 12), crop("pepper", "pepper", "Capsicum annuum", 12)],
    conflicts: [{ a: crop("onion", "onion", "Allium cepa", 2), b: crop("bean", "bush bean", "Phaseolus vulgaris", 10) }],
    duplicatedCropIds: [],
  }
  return (
    <div className="max-w-4xl">
      <RecommendationDisplay result={result} />
    </div>
  )
}
