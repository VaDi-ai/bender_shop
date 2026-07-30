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

// ─── Видео для рассылок: сырым, без перекодирования ──────────────────────────
import { sniffVideoType, storeVideo, MAX_VIDEO_BYTES } from '../lib/photo-store'
import * as fsMod from 'fs'
import * as os from 'os'
import * as pathMod from 'path'

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(24)])
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(24)])
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(24)])

describe('тип видео по содержимому', () => {
  it('узнаёт mp4/mov/webm', () => {
    expect(sniffVideoType(mp4)).toBe('mp4')
    expect(sniffVideoType(mov)).toBe('mov')
    expect(sniffVideoType(webm)).toBe('webm')
  })
  it('не верит расширению: мусор и картинки — не видео', () => {
    expect(sniffVideoType(Buffer.from('<html>x</html>xxxxx'))).toBeNull()
    expect(sniffVideoType(jpeg)).toBeNull()
    expect(sniffVideoType(Buffer.alloc(4))).toBeNull()
  })
  it('лимит — 20 МБ Telegram-скачивания по URL', () => {
    expect(MAX_VIDEO_BYTES).toBe(20 * 1024 * 1024)
  })
})

describe('storeVideo — сырое хранение', () => {
  it('пишет байт-в-байт (без sharp), имя из хеша, ссылка /photos/*.mp4', async () => {
    const dir = fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'qa-videos-'))
    const prev = process.env.PHOTOS_DIR
    process.env.PHOTOS_DIR = dir
    try {
      const r = await storeVideo(mp4, 'Тест Видео.mp4')
      expect(r.ok).toBe(true)
      expect(r.photo!.url).toMatch(/^\/photos\/.+\.mp4$/)
      const onDisk = fsMod.readFileSync(pathMod.join(dir, r.photo!.fileName))
      expect(onDisk.equals(mp4)).toBe(true)          // ни один байт не перекодирован
      const again = await storeVideo(mp4, 'другое-имя')
      expect(again.photo!.fileName.split('-').pop()).toBe(r.photo!.fileName.split('-').pop())
    } finally {
      process.env.PHOTOS_DIR = prev
      fsMod.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('больше 20 МБ — человеческий отказ, не молчаливый обрыв', async () => {
    const big = Buffer.concat([mp4, Buffer.alloc(MAX_VIDEO_BYTES)])
    const r = await storeVideo(big)
    expect(r).toMatchObject({ ok: false, status: 413 })
    expect(r.error).toContain('20 МБ')
    expect(r.error).toContain('Telegram')
  })

  it('не-видео — 422', async () => {
    expect((await storeVideo(Buffer.from('мусор-не-видео-совсем'))).status).toBe(422)
    expect((await storeVideo(Buffer.alloc(0))).status).toBe(422)
  })
})
