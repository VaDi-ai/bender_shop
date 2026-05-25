/**
 * Единое плоское имя для фото из вложенных папок:
 * относительный путь вида Samsung Stock/foo/bar.webp → Samsung Stock__foo__bar.webp
 * Нужно, чтобы basename без префикса стока (типичный экспорт Samsung) всё же матчился с брендом.
 */
export function posixRelFromNative(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/** Убирает недопустимые для файла символы, режет слишком длинное имя. */
export function sanitizeFlatPhotoName(flatKey: string, maxLen = 220): string {
  let s = flatKey.replace(/[<>:"|?*\x00\r\n]/g, '_').replace(/\s+/g, ' ').trim()
  if (s.length > maxLen) {
    const m = /\.(webp|png|jpe?g)$/i.exec(s)
    const ext = m ? m[0]!.toLowerCase() : ''
    const head = s.slice(0, maxLen - ext.length - 14)
    const h = [...s.slice(0, 80)].reduce((acc, ch) => (acc + ch.charCodeAt(0) * 31) >>> 0, 0).toString(16)
    s = `${head}__h${h.slice(0, 12)}${ext}`
  }
  return s
}

export function flattenRelativePhotoPath(nativeRel: string): string {
  const posix = posixRelFromNative(nativeRel)
  return sanitizeFlatPhotoName(posix.split('/').join('__'))
}
