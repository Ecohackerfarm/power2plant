import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
} from "power2plant"

export function ProjectCard() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Rooftop Aquaponics</CardTitle>
        <CardDescription>
          A closed-loop fish-and-greens system for the community kitchen,
          built from reclaimed materials over one growing season.
        </CardDescription>
        <CardAction>
          <Badge>92% funded</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          €4,600 raised of €5,000 goal · 128 backers · 6 days left
        </p>
      </CardContent>
      <CardFooter>
        <Button>Fund this project</Button>
      </CardFooter>
    </Card>
  )
}

export function Compact() {
  return (
    <Card size="sm" className="w-72">
      <CardHeader>
        <CardTitle>Weekly research log</CardTitle>
        <CardDescription>Updated 2 days ago</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Germination rates held at 84% after switching to the new soil blend.
        </p>
      </CardContent>
    </Card>
  )
}

export function WithAction() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Seed Library v2</CardTitle>
        <CardDescription>
          Catalogue and lend heirloom seeds across the network.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Draft · last saved a moment ago
        </p>
      </CardContent>
    </Card>
  )
}
