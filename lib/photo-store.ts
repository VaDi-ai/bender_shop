/**
 * Приём картинок из веб-админки (баннеры, фото категорий, фото товаров).
 *
 * Куда кладём: тот же том PHOTOS_DIR, что раздаётся статикой на /photos —
 * значит ссылка стабильная, переживает деплой и её можно писать в таблицу.
 *
 * Что проверяем (картинка уходит покупателю на витрину):
 *   • размер до 6 МБ — лимит есть и на body, и здесь;
 *   • тип по СОДЕРЖИМОМУ (magic bytes), а не по имени и не по Content-Type;
 *   • пережимаем через sharp в webp — так вырезается EXIF, полиглоты
 *     («картинка», которая одновременно html/js) и битые файлы;
 *   • имя генерируем сами из хеша — никакого пользовательского пути,
 *     traversal невозможен структурно.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { log } from './logger'

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024
const MAX_SIDE = 2000

/** Директория фото: та же логика, что у статики /photos в api/server.ts. */
export function photosDir(): string {
  return process.env.PHOTOS_DIR
    ? path.resolve(process.env.PHOTOS_DIR)
    : path.join(__dirname, '../../public/uploads/products')
}

/** Тип по сигнатуре файла. null → это не картинка, которую мы принимаем. */
export function sniffImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

export interface StoredPhoto {
  /** Публичная ссылка вида /photos/ab12….webp — её и пишем в таблицу */
  url: string
  fileName: string
  bytes: number
}

export interface StoreResult {
  ok: boolean
  status: number
  error?: string
  photo?: StoredPhoto
}

/**
 * Сохраняет картинку и возвращает публичную ссылку.
 * Ошибки — человеческим текстом, наружу не летит ни путь, ни стектрейс.
 */
export async function storePhoto(buf: Buffer, hint = 'photo'): Promise<StoreResult> {
  if (!buf?.length) return { ok: false, status: 422, error: 'Файл пустой — выберите картинку' }
  if (buf.length > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: `Картинка больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ — сожмите и попробуйте снова` }
  }
  const kind = sniffImageType(buf)
  if (!kind) return { ok: false, status: 422, error: 'Это не картинка. Подойдут JPG, PNG или WebP' }

  const dir = photosDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    return { ok: false, status: 503, error: 'Хранилище фото недоступно — попробуйте позже' }
  }

  let out: Buffer
  try {
    const sharp = (await import('sharp')).default
    out = await sharp(buf)
      .rotate()                                   // учесть EXIF-ориентацию до того, как её выкинем
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch (e) {
    log.warn('Photo re-encode failed', { err: e instanceof Error ? e.message : String(e) })
    return { ok: false, status: 422, error: 'Не удалось прочитать картинку — файл повреждён' }
  }

  // Имя из хеша содержимого: одинаковая картинка не плодит файлы, а имя
  // пользователь не контролирует вовсе.
  const slug = hint.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo'
  const hash = crypto.createHash('sha256').update(out).digest('hex').slice(0, 16)
  const fileName = `${slug}-${hash}.webp`
  try {
    fs.writeFileSync(path.join(dir, fileName), out)
  } catch (e) {
    log.error('Photo write failed', { err: e instanceof Error ? e.message : String(e) })
    return { ok: false, status: 503, error: 'Не удалось сохранить файл — попробуйте позже' }
  }

  return { ok: true, status: 201, photo: { url: `/photos/${fileName}`, fileName, bytes: out.length } }
}

/**
 * Ссылка на картинку, пригодная для витрины.
 *
 * Пускаем только своё: путь /photos/файл.webp (и ссылку на наш домен, которая
 * приводится к такому пути). Чужие домены отсекаем — витрина работает под CSP
 * img-src 'self', и такая картинка у покупателя просто не отрисуется. Всё
 * остальное (javascript:, data:, кавычки и скобки, ломающие css url()) — отказ:
 * значение уезжает и в вёрстку витрины, и в ячейку таблицы.
 */
export function normalizePhotoLink(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  const s = String(raw ?? '').replace(/\uFEFF/g, '').trim()
  if (!s) return { ok: false, error: 'Ссылка пустая' }
  if (s.length > 500) return { ok: false, error: 'Ссылка слишком длинная' }
  if (/[\s'"()<>\\]/.test(s)) return { ok: false, error: 'В ссылке есть недопустимые символы' }

  const FILE = /^[A-Za-z0-9._%-]+\.(webp|png|jpe?g)$/i
  if (s.startsWith('/photos/') && FILE.test(s.slice('/photos/'.length))) return { ok: true, url: s }

  // Ссылка на наш же домен приводится к пути — так она переживёт смену домена.
  const own = (process.env.WEBAPP_URL ?? 'https://bendershop.store').replace(/\/+$/, '')
  if (s.startsWith(own + '/photos/') && FILE.test(s.slice((own + '/photos/').length))) {
    return { ok: true, url: s.slice(own.length) }
  }

  if (/^https?:\/\//i.test(s)) {
    // Витрина под CSP img-src 'self': картинка с чужого домена не отрисуется
    // у покупателя — честнее отказать сразу, чем сохранить битую ссылку.
    return { ok: false, error: 'Ссылка с чужого сайта у покупателя не откроется — загрузите файл, он ляжет на наш домен' }
  }
  return { ok: false, error: 'Нужен файл или ссылка вида /photos/картинка.webp' }
}
