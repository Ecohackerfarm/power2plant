import { describe, it, expect } from 'vitest'
import { GET, POST } from '@/app/api/auth/[...all]/route'

describe('auth route handler', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function')
  })

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function')
  })
})
