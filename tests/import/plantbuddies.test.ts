import { describe, it, expect } from 'vitest'
import { parseRelationsJs } from '../../scripts/import/sources/plantbuddies'

describe('parseRelationsJs', () => {
  it('parses companion pair (b=1)', () => {
    const js = 'window.gRelationsArray = [{id:0,p1:"chives",p2:"leek",b:1}]'
    const result = parseRelationsJs(js)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ p1: 'chives', p2: 'leek', b: 1 })
  })

  it('parses incompatible pair (b=-1)', () => {
    const js = 'window.gRelationsArray = [{id:1,p1:"garlic",p2:"cabbage",b:-1}]'
    const result = parseRelationsJs(js)
    expect(result[0]).toMatchObject({ b: -1 })
  })

  it('filters out neutral pairs (b=0 or empty)', () => {
    const js = 'window.gRelationsArray = [{id:2,p1:"corn",p2:"wheat",b:0}]'
    const result = parseRelationsJs(js)
    expect(result).toHaveLength(0)
  })

  it('handles underscore plant names', () => {
    const js = 'window.gRelationsArray = [{id:3,p1:"sweet_basil",p2:"tomato",b:1}]'
    const result = parseRelationsJs(js)
    expect(result[0].p1).toBe('sweet basil')
  })
})
