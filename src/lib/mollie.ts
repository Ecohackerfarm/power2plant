import { createMollieClient } from '@mollie/api-client'

/** Cents → Mollie value string, e.g. 1050 → "10.50" */
export function centsToCurrencyString(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Returns a Mollie client. Throws if MOLLIE_API_KEY is not set. */
export function getMollieClient(): ReturnType<typeof createMollieClient> {
  const apiKey = process.env.MOLLIE_API_KEY
  if (!apiKey) throw new Error('MOLLIE_API_KEY not configured')
  return createMollieClient({ apiKey })
}
