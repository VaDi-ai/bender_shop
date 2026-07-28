/**
 * Приём картинок и ссылок из веб-админки. Всё, что тут проверяется, уходит
 * покупателю на витрину — поэтому проверки на содержимое, а не на имя файла.
 */
import { describe, it, expect } from 'vitest'
import { sniffImageType, normalizePhotoLink, MAX_UPLOAD_BYTES } from '../lib/photo-store'
import { publicImageUrl } from '../lib/storefront-admin'

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)])

describe('тип картинки по содержимому', () => {
  it('узнаёт jpeg/png/webp', () => {
    expect(sniffImageType(jpeg)).toBe('jpeg')
    expect(sniffImageType(png)).toBe('png')
    expect(sniffImageType(webp)).toBe('webp')
  })

  it('не верит расширению: html/svg/пустышка — не картинка', () => {
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(sniffImageType(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull()
    expect(sniffImageType(Buffer.from('GIF89a' + 'x'.repeat(20)))).toBeNull()   // gif не принимаем
    expect(sniffImageType(Buffer.alloc(0))).toBeNull()
    expect(sniffImageType(Buffer.from('ff', 'utf8'))).toBeNull()                // короче сигнатуры
  })

  it('лимит размера объявлен и вменяем', () => {
    expect(MAX_UPLOAD_BYTES).toBe(6 * 1024 * 1024)
  })
})

describe('ссылка на картинку', () => {
  it('свой путь /photos/… принимается, в том числе с %20', () => {
    expect(normalizePhotoLink('/photos/apple-iphone-17.webp')).toEqual({ ok: true, url: '/photos/apple-iphone-17.webp' })
    expect(normalizePhotoLink('/photos/Apple%20Watch%20S11.webp').ok).toBe(true)
  })

  it('ссылка на наш домен схлопывается в путь', () => {
    expect(normalizePhotoLink('https://bendershop.store/photos/a.webp')).toEqual({ ok: true, url: '/photos/a.webp' })
  })

  it('чужой домен — отказ с объяснением (CSP витрины его не покажет)', () => {
    const r = normalizePhotoLink('https://evil.example.com/x.png')
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('чужого сайта')
  })

  it('опасные схемы и обход пути — отказ', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      '/photos/../../etc/passwd',
      '/photos/../../../.env',
      "/photos/a.webp');background:url('http://evil",
      '/photos/a.webp" onerror="alert(1)',
      '/photos/файл.webp',            // кириллица в имени файла — не наш файл
      '/photos/a.exe',
      '/uploads/a.webp',
      '',
      '   ',
    ]) {
      expect(normalizePhotoLink(bad).ok, bad).toBe(false)
    }
  })

  it('слишком длинная ссылка — отказ', () => {
    expect(normalizePhotoLink('/photos/' + 'a'.repeat(600) + '.webp').ok).toBe(false)
  })
})

describe('ссылка витрины на картинку баннера/категории', () => {
  it('file_id из бота идёт через прокси, ссылка из веба — как есть', () => {
    expect(publicImageUrl('AgACAgIAAxkBAAI')).toBe('/api/banner/AgACAgIAAxkBAAI')
    expect(publicImageUrl('/photos/a.webp')).toBe('/photos/a.webp')
    expect(publicImageUrl('https://bendershop.store/photos/a.webp')).toBe('https://bendershop.store/photos/a.webp')
    expect(publicImageUrl(null)).toBeNull()
  })
})
