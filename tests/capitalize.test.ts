import { describe, it, expect } from 'vitest'
import { capitalizeAttr } from '../lib/sheets-sync'

describe('capitalizeAttr', () => {
  it('capitalizes lowercase color', () => {
    expect(capitalizeAttr('black')).toBe('Black')
    expect(capitalizeAttr('obsidian')).toBe('Obsidian')
  })

  it('does not touch numbers', () => {
    expect(capitalizeAttr('256GB')).toBe('256GB')
    expect(capitalizeAttr('12GB')).toBe('12GB')
  })

  it('does not touch abbreviations', () => {
    expect(capitalizeAttr('LTE')).toBe('LTE')
    expect(capitalizeAttr('GPS')).toBe('GPS')
  })

  it('does not touch eSIM', () => {
    expect(capitalizeAttr('eSIM')).toBe('eSIM')
  })

  it('does not touch Wi-Fi', () => {
    expect(capitalizeAttr('Wi-Fi')).toBe('Wi-Fi')
  })

  it('handles empty string', () => {
    expect(capitalizeAttr('')).toBe('')
  })
})
