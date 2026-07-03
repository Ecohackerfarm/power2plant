import type { NextConfig } from 'next'
import path from 'path'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  // Dev-only build/route overlay — hide it so it stops covering page content.
  devIndicators: false,
}

export default withNextIntl(nextConfig)
