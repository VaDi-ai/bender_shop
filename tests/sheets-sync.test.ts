import { describe, it, expect } from 'vitest'
import { extractProductName, parsePhotoUrls, mergeVariantPhotoUrls } from '../lib/sheets-sync'

describe('extractProductName', () => {
  it('iPhone: removes color, memory, country', () => {
    expect(extractProductName('iPhone 16 Pro 256GB Desert', 'Apple'))
      .toBe('Iphone 16 Pro')
  })

  it('Samsung: removes article, memory, SIM', () => {
    expect(extractProductName('Samsung Galaxy S26 Ultra 12/256GB Black', 'Samsung'))
      .toBe('Samsung Galaxy S26 Ultra')
  })

  it('iPad: removes chip, connectivity, memory', () => {
    expect(extractProductName('iPad Air 11 128GB Space Gray Wi-Fi M3', 'Apple'))
      .toBe('Ipad Air 11')
  })

  it('MacBook: removes screen size, config', () => {
    expect(extractProductName('MacBook Air 13 M5 16GB 512GB Midnight', 'Apple'))
      .toBe('Macbook Air M5')
  })

  it('MacBook NEO: does not include chip in name', () => {
    expect(extractProductName('MacBook NEO 256Gb Silver', 'Apple'))
      .toBe('Macbook NEO')
  })

  it('Apple Watch: removes size, band, material', () => {
    expect(extractProductName('Apple Watch Ultra 2 49 Black Ti Black Ocean Band', 'Apple'))
      .toBe('Apple Watch Ultra 2')
  })
})

describe('parsePhotoUrls', () => {
  it('парсит одну URL', () => {
    expect(parsePhotoUrls('https://example.com/photo.jpg'))
      .toEqual(['https://example.com/photo.jpg'])
  })

  it('парсит несколько URL через запятую', () => {
    expect(parsePhotoUrls('https://a.com/1.jpg, https://b.com/2.jpg, https://c.com/3.jpg'))
      .toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg', 'https://c.com/3.jpg'])
  })

  it('обрабатывает URL с query string содержащим запятую', () => {
    expect(parsePhotoUrls('https://a.com/photo?size=100,200'))
      .toEqual(['https://a.com/photo?size=100,200'])
  })

  it('возвращает пустой массив для пустой строки', () => {
    expect(parsePhotoUrls('')).toEqual([])
    expect(parsePhotoUrls('   ')).toEqual([])
  })

  it('фильтрует невалидные значения', () => {
    expect(parsePhotoUrls('not-a-url, https://valid.com/photo.jpg'))
      .toEqual(['https://valid.com/photo.jpg'])
  })

  it('обрезает пробелы', () => {
    expect(parsePhotoUrls('  https://a.com/1.jpg ,  https://b.com/2.jpg  '))
      .toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg'])
  })

  it('принимает относительные пути CDN', () => {
    expect(parsePhotoUrls('/photos/item.webp')).toEqual(['/photos/item.webp'])
    expect(parsePhotoUrls('/photos/a.webp, /photos/b.webp')).toEqual(['/photos/a.webp', '/photos/b.webp'])
  })

  it('снимает обрамляющие кавычки (вставка из таблиц)', () => {
    expect(parsePhotoUrls('"https://a.com/a.webp"')).toEqual(['https://a.com/a.webp'])
  })

  it('поддерживает http (без s)', () => {
    expect(parsePhotoUrls('http://insecure.com/photo.jpg'))
      .toEqual(['http://insecure.com/photo.jpg'])
  })
})

describe('mergeVariantPhotoUrls', () => {
  it('склеивает уникальные URL в порядке встречи', () => {
    expect(mergeVariantPhotoUrls([
      { photoUrls: ['https://a/1.webp', 'https://a/2.webp'] },
      { photoUrls: ['https://a/1.webp', 'https://a/3.webp'] },
    ])).toEqual(['https://a/1.webp', 'https://a/2.webp', 'https://a/3.webp'])
  })

  it('пустые варианты не ломают', () => {
    expect(mergeVariantPhotoUrls([{ photoUrls: [] }, { photoUrls: ['https://x/y'] }])).toEqual(['https://x/y'])
  })
})
