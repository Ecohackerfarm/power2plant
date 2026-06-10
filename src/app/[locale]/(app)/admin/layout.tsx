import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  if (!session?.user?.email || !adminEmails.includes(session.user.email.toLowerCase())) {
    redirect('/')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {children}
    </div>
  )
}
