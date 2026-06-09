import Link from 'next/link'

const SECTIONS = [
  { href: '/admin/feedback', label: 'Feedback', description: 'View user feedback submissions' },
  { href: '/admin/research-requests', label: 'Research Requests', description: 'Manage plant research requests' },
  { href: '/admin/research-queue', label: 'Research Queue', description: 'Monitor the research processing queue' },
  { href: '/admin/settings', label: 'Settings', description: 'Configure application settings' },
]

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map(({ href, label, description }) => (
          <Link
            key={href}
            href={href}
            className="block p-4 border rounded-lg hover:bg-accent transition-colors"
          >
            <div className="font-semibold">{label}</div>
            <div className="text-sm text-muted-foreground mt-1">{description}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
