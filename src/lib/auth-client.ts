import { createAuthClient } from 'better-auth/react'
import { clientEnv } from './client-env'

export const authClient = createAuthClient({
  baseURL: clientEnv.appUrl(),
})

export const { signIn, signUp, signOut, useSession } = authClient
