// design-sync shim for `@/lib/auth-client`.
//
// The real module is better-auth's createAuthClient, which makes network calls
// to a session endpoint that doesn't exist in the design sandbox. The converter
// rewrites `@/lib/auth-client` to this file (see .design-sync/tsconfig.shim.json).
// We return a signed-in session so the feature components render their full
// authenticated surface (e.g. RecommendationDisplay's "Add to garden" / "Accept
// this plan" actions) instead of hiding it behind an anonymous state.
const session = {
  data: { user: { id: 'demo', name: 'Demo Gardener', email: 'demo@ecohackerfarm.org' } },
  isPending: false,
  error: null,
}

export function useSession() { return session }

const noop = async () => ({ data: null, error: null })
export const signIn = noop
export const signUp = noop
export const signOut = noop
export const authClient = { useSession, signIn, signUp, signOut }
