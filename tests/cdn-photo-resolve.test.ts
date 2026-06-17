import { describe, expect, it } from 'vitest'
import {
  buildCdnPhotoIndex,
  cleanPhotoUrl,
  collapseSpaces,
  normalizeCdnPhotoUrl,
  photoBasenameFromUrl,
  resetCdnPhotoIndexCache,
  resolveCdnPhotoUrl,
} from '../lib/cdn-photo-resolve'

describe('cdn-photo-resolve', () => {
  const index = buildCdnPhotoIndex([
    'Apple Watch S11  Silver.png',
    'Apple Watch S11  Space Gray.png',
    'Apple Watch S11 Jet Black.png',
    'Samsung galaxy S25 Gray  2.png',
  ])

  it('collapseSpaces', () => {
    expect(collapseSpaces('Apple  Watch   S11')).toBe('Apple Watch S11')
  })

  it('photoBasenameFromUrl', () => {
    expect(photoBasenameFromUrl('https://bendershop.store/photos/Apple%20Watch%20S11%20Silver.png'))
      .toBe('Apple Watch S11 Silver.png')
  })

  it('resolveCdnPhotoUrl fixes spacing vs CDN filename', () => {
    expect(
      resolveCdnPhotoUrl('https://bendershop.store/photos/Apple%20Watch%20S11%20Silver.png', index),
    ).toBe('https://bendershop.store/photos/Apple%20Watch%20S11%20%20Silver.png')
    expect(
      resolveCdnPhotoUrl('/photos/Apple Watch S11 Space Gray.png', index),
    ).toBe('/photos/Apple%20Watch%20S11%20%20Space%20Gray.png')
    expect(
      resolveCdnPhotoUrl('https://bendershop.store/photos/Apple%20Watch%20S11%20Jet%20Black.png', index),
    ).toBe('https://bendershop.store/photos/Apple%20Watch%20S11%20Jet%20Black.png')
  })

  it('cleanPhotoUrl strips trailing comma junk', () => {
    expect(cleanPhotoUrl('https://x/photos/a.png ,')).toBe('https://x/photos/a.png')
  })

  it('normalizeCdnPhotoUrl without index returns url unchanged', () => {
    resetCdnPhotoIndexCache()
    expect(normalizeCdnPhotoUrl('https://example.com/photos/x.png'))
      .toBe('https://example.com/photos/x.png')
  })
})
