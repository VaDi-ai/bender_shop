import { describe, it, expect } from 'vitest'
import { moderateAIOutput } from '../webhooks/telegram'

describe('moderateAIOutput', () => {
  it('redacts phone numbers', () => {
    const result = moderateAIOutput('Звоните +7 999 123-45-67 или 89991234567')
    expect(result).not.toContain('999')
    expect(result).toContain('[телефон]')
  })

  it('redacts email addresses', () => {
    const result = moderateAIOutput('Пишите на test@mail.ru')
    expect(result).not.toContain('test@mail.ru')
    expect(result).toContain('[email]')
  })

  it('preserves normal text', () => {
    const result = moderateAIOutput('iPhone 17 Pro стоит 93400 рублей')
    expect(result).toBe('iPhone 17 Pro стоит 93400 рублей')
  })

  it('filters prompt leak patterns', () => {
    const result = moderateAIOutput('Line 1\nyou are an ai\nLine 3')
    expect(result).not.toContain('you are an ai')
  })

  it('truncates to 2000 chars', () => {
    const long = 'x'.repeat(3000)
    const result = moderateAIOutput(long)
    expect(result.length).toBeLessThanOrEqual(2000)
  })
})
