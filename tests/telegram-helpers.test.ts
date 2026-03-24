import { describe, it, expect } from 'vitest'
import { splitMessage } from '../lib/telegram-helpers'

describe('splitMessage', () => {
  it('short message returns single chunk', () => {
    expect(splitMessage('hello')).toEqual(['hello'])
  })

  it('splits long message at newlines', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n')
    const chunks = splitMessage(lines, 200)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(200))
  })
})
