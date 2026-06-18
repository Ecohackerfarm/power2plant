import { Input, Label } from "power2plant"

export function FormField() {
  return (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="title">Project title</Label>
      <Input id="title" placeholder="Rooftop Aquaponics" />
    </div>
  )
}

export function Required() {
  return (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="goal">
        Funding goal
        <span className="text-destructive">*</span>
      </Label>
      <Input id="goal" type="number" placeholder="5000" />
    </div>
  )
}

export function Disabled() {
  return (
    <div className="group flex w-72 flex-col gap-2" data-disabled="true">
      <Label htmlFor="locked">Project ID</Label>
      <Input id="locked" defaultValue="p2p-0042" disabled />
    </div>
  )
}
