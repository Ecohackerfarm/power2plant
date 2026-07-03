import { Button } from "power2plant"

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Fund this project</Button>
      <Button variant="secondary">Follow</Button>
      <Button variant="outline">Share</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Withdraw pledge</Button>
      <Button variant="link">Read the research log</Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  )
}

export function States() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Enabled</Button>
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>
        Disabled outline
      </Button>
    </div>
  )
}

export function CallToAction() {
  return (
    <div className="flex items-center gap-2">
      <Button>Pledge €25</Button>
      <Button variant="outline">Choose a different amount</Button>
    </div>
  )
}
