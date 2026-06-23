// Brand identity as a design/theme constant — intentionally NOT an env var.
// The wordmark image already spells the brand name, so the header renders it
// directly. The BRAND_NAME env var still drives *text* contexts (page <title>,
// auth emails, payment descriptions, feedback digests) via lib/client-env.ts.
export const brand = {
  // Cream wordmark, sized to read on the dark-moss header background.
  // Source: assets/raw/graphics/Harmonic Garden - font.png (trimmed + recolored).
  wordmark: {
    src: '/wordmark.png',
    alt: 'Harmonic Garden',
    width: 286,
    height: 96,
  },
} as const
