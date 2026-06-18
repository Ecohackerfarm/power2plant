import { Badge } from "power2plant"

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Funded</Badge>
      <Badge variant="secondary">Seedling</Badge>
      <Badge variant="outline">Draft</Badge>
      <Badge variant="destructive">Closed</Badge>
      <Badge variant="ghost">Archived</Badge>
      <Badge variant="link">Details</Badge>
    </div>
  )
}

export function ProjectStatuses() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">Rooftop Aquaponics</span>
        <Badge>92% funded</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Mycelium Insulation</span>
        <Badge variant="secondary">In review</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Seed Library v2</span>
        <Badge variant="outline">Planning</Badge>
      </div>
    </div>
  )
}

export function Counts() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">3 new</Badge>
      <Badge>128 backers</Badge>
      <Badge variant="outline">12 updates</Badge>
    </div>
  )
}
