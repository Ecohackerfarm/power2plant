import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export async function isAdmin(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) return false
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(session.user.email.toLowerCase())
}
