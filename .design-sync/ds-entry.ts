// design-sync bundle entry for power2plant.
// Re-exports the scoped ui primitives (+ Card compound parts) so esbuild emits
// one IIFE assigning every export to window.Power2Plant. PKG_DIR resolves to the
// repo root by walking up from this file to the nearest named package.json.
export { Button, buttonVariants } from '../src/components/ui/button'
export { Badge, badgeVariants } from '../src/components/ui/badge'
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from '../src/components/ui/card'
export { Input } from '../src/components/ui/input'
export { Label } from '../src/components/ui/label'
export { Separator } from '../src/components/ui/separator'

// Stateful feature components — wrapped with providers + a mock /api backend so
// they render standalone in the design sandbox (see feature-exports.tsx).
export { PlantSearch, RecommendationDisplay } from './feature-exports'
