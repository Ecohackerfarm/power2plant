import { Input, Label } from "power2plant"

export function Default() {
  return <Input placeholder="Search projects…" className="w-72" />
}

export function WithLabel() {
  return (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="pledge">Pledge amount (€)</Label>
      <Input id="pledge" type="number" defaultValue={25} />
    </div>
  )
}

export function Email() {
  return (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="email">Email for project updates</Label>
      <Input id="email" type="email" placeholder="you@example.org" />
    </div>
  )
}

export function Disabled() {
  return (
    <Input className="w-72" placeholder="Funding closed" disabled />
  )
}

export function Invalid() {
  return (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="amount">Pledge amount (€)</Label>
      <Input id="amount" aria-invalid defaultValue="-5" />
      <p className="text-xs text-destructive">Enter an amount of €1 or more.</p>
    </div>
  )
}
