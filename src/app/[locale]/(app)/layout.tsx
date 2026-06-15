import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { version } from '../../../../package.json'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  const isAdmin = !!(
    session?.user?.email &&
    adminEmails.includes(session.user.email.toLowerCase())
  )

  return (
    <>
      <SiteHeader isAdmin={isAdmin} version={version} />
      {children}
    </>
  )
}
