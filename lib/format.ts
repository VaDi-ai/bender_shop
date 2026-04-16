export function fmtPrice(n: number | string): string {
  return Number(n).toLocaleString('ru-RU')
}

export function fmtPriceWithCurrency(n: number | string): string {
  return fmtPrice(n) + ' ₽'
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`
  if (mod10 === 1) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}

/**
 * Форматирует атрибуты варианта (JSON) в строку для отображения.
 * Вход: { "Цвет": "Silver", "Память": "256GB", "SIM": "eSIM" }
 * Выход: "Silver / 256GB / eSIM"
 * Пустые/null значения отфильтровываются. Порядок — как в объекте.
 * Массивы игнорируются (возвращается пустая строка) — защита от нетипичных JSON.
 */
export function formatVariantAttrs(attrs: unknown): string {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return ''
  const obj = attrs as Record<string, unknown>
  const values: string[] = []
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v == null) continue
    const s = String(v).trim()
    if (s) values.push(s)
  }
  return values.join(' / ')
}

/**
 * Форматирует полное имя товара с атрибутами варианта.
 * Если атрибутов нет — возвращает только имя товара.
 * Пример: formatProductNameWithAttrs("iPhone 17 Pro", {"Цвет":"Silver","Память":"256GB"})
 *         → "iPhone 17 Pro (Silver / 256GB)"
 */
export function formatProductNameWithAttrs(productName: string, variantAttrs: unknown): string {
  const attrs = formatVariantAttrs(variantAttrs)
  return attrs ? productName + ' (' + attrs + ')' : productName
}
