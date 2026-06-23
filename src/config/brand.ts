// Brand identity as a design/theme constant — intentionally NOT an env var.
// The header renders the name as a typographic logotype in Fraunces (the page's
// own serif) plus a small botanical mark, so the logo shares the site's type
// system instead of clashing as an illustration. The BRAND_NAME env var still
// drives *text* contexts (page <title>, auth emails, payment descriptions,
// feedback digests) via lib/client-env.ts.
export const brand = {
  name: 'Harmonic Garden',
} as const
