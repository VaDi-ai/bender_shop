/**
 * Нормализация family/цвета для match-photos (общая для скрипта и тестов).
 */

/** Нормализует цвет: 'Jet Black', 'jetblack' → 'jet black' */
export function normColor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitGluedColor(s: string): string {
  return s
    .replace(/jetblack/gi, 'jet black')
    .replace(/spacegray/gi, 'space gray')
    .replace(/spaceblack/gi, 'space black')
    .replace(/rosegold/gi, 'rose gold')
    .replace(/pinkgold/gi, 'pink gold')
    .replace(/lightgold/gi, 'light gold')
    .replace(/skyblue/gi, 'sky blue')
    .replace(/icyblue/gi, 'icy blue')
    .replace(/silverblue/gi, 'silver blue')
    .replace(/whitesilver/gi, 'white silver')
    .replace(/titaniumnatural/gi, 'titanium natural')
    .replace(/titaniumblack/gi, 'titanium black')
    .replace(/titaniumgray/gi, 'titanium gray')
    .replace(/titaniumgrey/gi, 'titanium gray')
    .replace(/titaniumsilver/gi, 'titanium silver')
    .replace(/blueshadow/gi, 'blue shadow')
    .replace(/silvershadow/gi, 'silver shadow')
    .replace(/cosmicorange/gi, 'cosmic orange')
    .replace(/deepblue/gi, 'deep blue')
    .replace(/mistblue/gi, 'mist blue')
}

const FAMILY_ALIASES: Record<string, Record<string, string>> = {
  Apple: {
    'iphone air': 'iphone 17 air',
    'ipad mini': 'ipad mini',
  },
}

/** Единый ключ family для Galaxy S / S+ / Ultra / FE / Edge. */
export function parseSamsungGalaxySFamilyFromText(searchable: string): string | null {
  const t = searchable.toLowerCase().replace(/_/g, ' ')
  const idx = t.search(/\bgalaxy\s+s\s*\d+/i)
  if (idx < 0) return null
  const slice = t.slice(idx)

  let m = slice.match(/^galaxy\s+s\s*(\d+)\+(?:\s|$)/i)
  if (m) return `galaxy s${m[1]} plus`

  m = slice.match(/^galaxy\s+s\s*(\d+)\s+(ultra|edge|fe)\b/i)
  if (m) return `galaxy s${m[1]} ${m[2]!.toLowerCase()}`

  m = slice.match(/^galaxy\s+s\s*(\d+)\b/i)
  if (m) return `galaxy s${m[1]}`

  return null
}

export function canonicalFamily(brand: string, family: string): string {
  let f = family.toLowerCase().trim().replace(/\s+/g, ' ')
  const aliases = FAMILY_ALIASES[brand]
  if (aliases?.[f]) f = aliases[f]!
  if (brand === 'Apple' && f === 'iphone air') f = 'iphone 17 air'
  return f
}

/** Сравнение цветов с учётом Titanium*, составных маркетинговых имён Samsung и light gold ↔ gold. */
export function colorsCompatible(photoColor: string, sheetColor: string, familyHint = ''): boolean {
  const p = normColor(splitGluedColor(photoColor))
  const s = normColor(splitGluedColor(sheetColor))
  if (!p && !s) return true
  if (!p || !s) return false
  if (p === s) return true

  const stripTi = (c: string) => c.replace(/^titanium\s+/, '').trim()
  if (stripTi(s) === p || stripTi(p) === s) return true

  const fam = familyHint.toLowerCase()
  const ultraLine = /\bultra\b/.test(fam) || /\bgalaxy\s+s\d+\s+ultra\b/.test(fam)

  if (ultraLine || /^titanium\b/.test(s)) {
    if (p === 'black' && /\bblack\b/.test(s)) return true
    if (p === 'gray' && /\bgray\b/.test(s)) return true
    if (p === 'grey' && /\bgrey?\b/.test(s)) return true
    if (p === 'white' && /\bwhite\b/.test(s)) return true
    if (p === 'silver' && /\bsilver\b/.test(s)) return true
    if (p === 'blue' && /\bblue\b/.test(s)) return true
    if (p === 'violet' && /\bviolet\b/.test(s)) return true
    const tail = stripTi(s)
    if (tail === p || tail.replace(/\s+/g, '') === p.replace(/\s+/g, '')) return true
  }

  if (p.replace(/\s+/g, '') === s.replace(/\s+/g, '')) return true

  if (p === 'gold' && s === 'light gold') return true
  if (p === 'light gold' && s === 'gold') return true

  if (p.length >= 4 && s.includes(p)) return true
  if (s.length >= 4 && p.includes(s)) return true

  return false
}

export function familiesAlign(brand: string, photoFam: string, sheetFam: string): boolean {
  const p = canonicalFamily(brand, photoFam)
  const s = canonicalFamily(brand, sheetFam)
  if (p === s) return true
  if (s.startsWith(p + ' ') || p.startsWith(s + ' ')) return true
  return false
}
