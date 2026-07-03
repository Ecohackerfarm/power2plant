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
      <nav className="mb-6 flex gap-4 text-sm">
        <a href="/admin/feedback" className="text-muted-foreground hover:text-foreground">Feedback</a>
        <a href="/admin/research-requests" className="text-muted-foreground hover:text-foreground">Research Requests</a>
        <a href="/admin/research-queue" className="text-muted-foreground hover:text-foreground">Research Queue</a>
        <a href="/admin/settings" className="text-muted-foreground hover:text-foreground">Settings</a>
      </nav>
      {children}
    </div>
  )
}
