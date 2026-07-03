import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { SiteBackground } from '@/components/site-background'
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
      <SiteBackground />
      <SiteHeader isAdmin={isAdmin} version={version} />
      {/* Above the fixed background; pt-16 clears the floating corner controls */}
      <div className="relative z-10 pt-16">{children}</div>
    </>
  )
}
