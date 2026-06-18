// design-sync shim for `@/i18n/navigation`.
//
// The real module is next-intl's `createNavigation`, built on next/navigation —
// its Link/useRouter need a mounted Next.js app-router context that doesn't
// exist in the claude.ai/design browser sandbox (they throw "invariant: app
// router not mounted"). The converter's tsconfig-paths esbuild plugin rewrites
// `@/i18n/navigation` to this file (see .design-sync/tsconfig.shim.json), so the
// shipped feature components get a plain <a> + no-op router and render anywhere.
import * as React from 'react'

type LinkProps = { href?: string | { pathname?: string }; children?: React.ReactNode } & Record<string, unknown>

export function Link({ href, children, ...rest }: LinkProps) {
  const h = typeof href === 'string' ? href : (href?.pathname ?? '#')
  return React.createElement('a', { href: h, ...rest }, children)
}

const noop = () => {}
export function useRouter() {
  return { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }
}
export function usePathname() { return '/' }
export function redirect(_href?: string) {}
