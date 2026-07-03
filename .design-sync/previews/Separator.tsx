import { Separator } from "power2plant"

export function Horizontal() {
  return (
    <div className="w-72">
      <p className="text-sm font-medium">Rooftop Aquaponics</p>
      <Separator className="my-3" />
      <p className="text-sm text-muted-foreground">
        A closed-loop fish-and-greens system for the community kitchen.
      </p>
    </div>
  )
}

export function Vertical() {
  return (
    <div className="flex h-5 items-center gap-3 text-sm">
      <span>Overview</span>
      <Separator orientation="vertical" />
      <span>Updates</span>
      <Separator orientation="vertical" />
      <span>Backers</span>
    </div>
  )
}

export function InCard() {
  return (
    <div className="flex w-72 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Raised</span>
        <span className="font-medium">€4,600</span>
      </div>
      <Separator />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Goal</span>
        <span className="font-medium">€5,000</span>
      </div>
    </div>
  )
}
