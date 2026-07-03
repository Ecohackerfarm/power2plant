import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { SiteBackground } from '@/components/site-background'
import { version } from '../../../../package.json'

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
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
      {/* Pre-paint: decide whether the intro plays and hide the chrome before
          first paint (no flash). Plays desktop-only, once per session, or when
          ?intro is present (dev). A 6s fallback reveals the page if JS stalls. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{
            var p=new URLSearchParams(location.search);
            var force=p.has('intro');
            var big=window.matchMedia('(min-width:768px)').matches;
            var motion=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var seen=sessionStorage.getItem('hgIntroSeen');
            if(force||(!seen&&big&&motion)){
              document.documentElement.setAttribute('data-intro','running');
              setTimeout(function(){document.documentElement.removeAttribute('data-intro');},6000);
            }
          }catch(e){}})();`,
        }}
      />
      <SiteBackground />
      <SiteHeader isAdmin={isAdmin} version={version} />
      {children}
    </>
  )
}
