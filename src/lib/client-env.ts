type PublicEnv = {
  NEXT_PUBLIC_APP_URL: string
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string | undefined
  NEXT_PUBLIC_KOFI_URL: string | undefined
}

declare global {
  interface Window { __ENV__: PublicEnv }
}

// Bracket notation prevents Next.js DefinePlugin from inlining these at build
// time, so the server bundle always reads from the real runtime process.env.
function runtimeEnv<K extends keyof PublicEnv>(key: K): PublicEnv[K] {
  if (typeof window !== 'undefined') return window.__ENV__?.[key] as PublicEnv[K]
  return (process.env as NodeJS.ProcessEnv)[key] as PublicEnv[K]
}

export const clientEnv = {
  appUrl:               (): string        => runtimeEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000',
  stripePublishableKey: (): string | undefined => runtimeEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  kofiUrl:              (): string | undefined => runtimeEnv('NEXT_PUBLIC_KOFI_URL'),
} as const
