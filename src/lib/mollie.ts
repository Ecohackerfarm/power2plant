import { createMollieClient } from '@mollie/api-client'

export const mollieClient = createMollieClient({
  apiKey: process.env.MOLLIE_API_KEY ?? '',
})

/** Cents → Mollie value string, e.g. 1050 → "10.50" */
export function centsToCurrencyString(cents: number): string {
  return (cents / 100).toFixed(2)
}
