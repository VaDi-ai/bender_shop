/**
 * Сопоставление URL фото с реальными именами на CDN.
 * Частая ошибка: в таблице/БД один пробел, в файле — два (Apple Watch S11  Silver.png).
 */
import fs from 'fs'
import path from 'path'

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Убирает мусор из вставки в Google Sheets: «…png ,» или пробелы в конце. */
export function cleanPhotoUrl(url: string): string {
  return String(url ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/[,\s]+$/g, '')
    .trim()
}

export function photoBasenameFromUrl(url: string): string | null {
  const t = String(url ?? '').trim()
  if (!t) return null
  try {
    const base = /^https?:\/\//i.test(t) ? t : `https://local${t.startsWith('/') ? t : `/${t}`}`
    const pathname = new URL(base).pathname
    const tail = pathname.split('/').pop()
    if (!tail) return null
    return decodeURIComponent(tail)
  } catch {
    const m = /\/([^/?#]+)$/.exec(t)
    if (!m?.[1]) return null
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
}

export type CdnPhotoIndex = {
  byCollapsed: Map<string, string>
  exact: Set<string>
  ambiguous: Map<string, string[]>
}

export function buildCdnPhotoIndex(filenames: Iterable<string>): CdnPhotoIndex {
  const byCollapsed = new Map<string, string>()
  const exact = new Set<string>()
  const ambiguous = new Map<string, string[]>()

  for (const raw of filenames) {
    const f = String(raw ?? '').trim()
    if (!f) continue
    exact.add(f)
    const key = collapseSpaces(f).toLowerCase()
    const prev = byCollapsed.get(key)
    if (!prev) {
      byCollapsed.set(key, f)
      continue
    }
    if (prev !== f) {
      const list = ambiguous.get(key) ?? [prev]
      if (!list.includes(f)) list.push(f)
      ambiguous.set(key, list)
    }
  }

  return { byCollapsed, exact, ambiguous }
}

export function readPhotoFilenamesFromDir(dir: string): string[] {
  if (!dir || !fs.existsSync(dir)) return []
  const out: string[] = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    try {
      if (fs.statSync(full).isFile() && /\.(png|webp|jpe?g)$/i.test(name)) out.push(name)
    } catch {
      /* skip */
    }
  }
  return out
}

function rebuildPhotoUrl(url: string, actualBasename: string): string {
  const encoded = encodeURIComponent(actualBasename)
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      u.pathname = u.pathname.replace(/\/[^/]+$/, `/${encoded}`)
      return u.toString()
    } catch {
      return url
    }
  }
  if (url.startsWith('/photos/')) return `/photos/${encoded}`
  return url
}

/**
 * Подставляет фактическое имя файла на CDN, если отличается только количеством пробелов/регистром.
 */
export function resolveCdnPhotoUrl(url: string, index: CdnPhotoIndex | null | undefined): string {
  const t = cleanPhotoUrl(url)
  if (!t || !/\/photos\//i.test(t)) return t

  const basename = photoBasenameFromUrl(t)
  if (!basename) return t

  if (index?.exact.has(basename)) return t

  if (index) {
    const key = collapseSpaces(basename).toLowerCase()
    const actual = index.byCollapsed.get(key)
    if (actual && actual !== basename) return rebuildPhotoUrl(t, actual)
  }

  return t
}

let cachedIndex: CdnPhotoIndex | null | undefined

/** Индекс из PHOTOS_DIR (прод) или FOTO_DIR / ./Foto (локальный аудит). */
export function getCdnPhotoIndex(): CdnPhotoIndex | null {
  if (cachedIndex !== undefined) return cachedIndex

  const candidates = [
    process.env.PHOTOS_DIR,
    process.env.FOTO_DIR,
    path.join(process.cwd(), 'Foto'),
  ].filter(Boolean) as string[]

  for (const dir of candidates) {
    const files = readPhotoFilenamesFromDir(dir)
    if (files.length > 0) {
      cachedIndex = buildCdnPhotoIndex(files)
      return cachedIndex
    }
  }

  cachedIndex = null
  return null
}

export function resetCdnPhotoIndexCache(): void {
  cachedIndex = undefined
}

/** Для sync / sanitize: нормализует URL по индексу CDN (если доступен). */
export function normalizeCdnPhotoUrl(url: string): string {
  return resolveCdnPhotoUrl(url, getCdnPhotoIndex())
}
