type PublicEnv = {
  APP_URL: string
  STRIPE_PUBLISHABLE_KEY: string | undefined
  KOFI_URL: string | undefined
}

declare global {
  interface Window { __ENV__: PublicEnv }
}

// These are NON-NEXT_PUBLIC names on purpose: nothing is baked into the public
// image. On the server we read the real runtime process.env; in the browser we
// read window.__ENV__, injected per-request by the root layout. Plain names
// (no NEXT_PUBLIC_ prefix) cannot be inlined into the client bundle by Next.js,
// so the only way to reach them client-side is through this helper.
function runtimeEnv<K extends keyof PublicEnv>(key: K): PublicEnv[K] {
  if (typeof window !== 'undefined') return window.__ENV__?.[key] as PublicEnv[K]
  return (process.env as NodeJS.ProcessEnv)[key] as PublicEnv[K]
}

export const clientEnv = {
  appUrl:               (): string        => runtimeEnv('APP_URL') ?? 'http://localhost:3000',
  stripePublishableKey: (): string | undefined => runtimeEnv('STRIPE_PUBLISHABLE_KEY'),
  kofiUrl:              (): string | undefined => runtimeEnv('KOFI_URL'),
} as const
