import { describe, it, expect } from 'vitest'

// Copied from webapp inline function
function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

describe('esc() XSS protection', () => {
  it('escapes HTML tags', () => {
    expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  it('escapes ampersands', () => {
    expect(esc('a & b')).toBe('a &amp; b')
  })

  it('handles empty string', () => {
    expect(esc('')).toBe('')
  })
})
