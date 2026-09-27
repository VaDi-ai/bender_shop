/**
 * Read-only: классификация пар Apple Watch по ТИПУ РЕМЕШКА.
 *
 * Регулируемые (Milanese Loop, Link Bracelet) — размера S/M–M/L не существует,
 * лишний размер = мусор, пара — истинный дубль.
 * С размерами (Sport Band, Sport Loop, Solo Loop, Braided Solo Loop) — размер
 * реальный, S/M и M/L НЕ склеивать.
 * Тип не определился — «спорные», не трогаем.
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const out: string[] = []
const say = (s = ''): void => { console.log(s); out.push(s) }

/**
 * Словарь ремешков по живым данным листа. Аббревиатуры расшифрованы по массиву
 * имён: «SB» = Sport Band, «SL» = Sport Loop, «LB» в «Rose Gold Al LB SB» — это
 * ЦВЕТ (Light Blue), а не Link Bracelet: рядом всегда стоит SB. Поэтому одинокий
 * «LB» считаем неоднозначным и уводим в «спорные», а не в регулируемые.
 *
 * Порядок важен: сначала размерные (SB/SL/Solo/Braided), потому что «Milanese»
 * в тех же именах не встречается, а вот SB — сплошь и рядом.
 */
const SIZED = [
  { canon: 'Braided Solo Loop', re: /\bbraided\s*solo\s*loop\b/i },
  { canon: 'Solo Loop', re: /\bsolo\s*loop\b/i },
  { canon: 'Sport Band', re: /\bsport\s*band\b|\bSB\b/ },
  { canon: 'Sport Loop', re: /\bsport\s*loop\b|\bSL\b/ },
  { canon: 'Alpine Loop', re: /\balpine\s*loop\b/i },
  { canon: 'Trail Loop', re: /\btrail\s*loop\b/i },
  { canon: 'Ocean Band', re: /\bocean\s*band\b/i },
]
/** Регулируемые: подгоняются по руке, размера S/M–M/L у них не существует. */
const ADJUSTABLE = [
  { canon: 'Milanese Loop', re: /\bmilanese\b/i },
  { canon: 'Link Bracelet', re: /\blink\s*bracelet\b/i },
]
/** Тип ремешка есть, но по размерности он не классический — трактуем как размерный. */
const OTHER_TYPES = [
  { canon: 'Charcoal Loop', re: /\bcharcoal\s*loop\b/i },
]
const SIZE_TOKEN = /^(s\/m|m\/l|s|m|l)$/i

type Klass = 'регулируемый' | 'с размером' | 'спорный'
function classify(text: string): { klass: Klass; strap: string | null } {
  for (const s of SIZED) if (s.re.test(text)) return { klass: 'с размером', strap: s.canon }
  for (const a of ADJUSTABLE) if (a.re.test(text)) return { klass: 'регулируемый', strap: a.canon }
  for (const o of OTHER_TYPES) if (o.re.test(text)) return { klass: 'с размером', strap: o.canon }
  return { klass: 'спорный', strap: null }
}

const SYS = new Set(['fullName', 'attrOverrides'])
const cleanAttrs = (a: unknown): Record<string, string> => {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries((a ?? {}) as Record<string, unknown>)) {
    if (SYS.has(k) || v === null || v === undefined || typeof v === 'object') continue
    o[k] = String(v).trim()
  }
  return o
}
const keyWithout = (a: Record<string, string>, skip: string): string =>
  Object.entries(a).filter(([k]) => k !== skip).map(([k, v]) => `${k}=${v.toLowerCase()}`).sort().join(' | ')

async function main() {
  const watches = await prisma.product.findMany({
    where: { OR: [{ name: { contains: 'watch', mode: 'insensitive' } }, { name: { contains: 'часы', mode: 'insensitive' } }] },
    include: { variants: { select: { id: true, sku: true, attributes: true, quantity: true, inStock: true, price: true } } },
  })
  say('=== ТОВАРЫ APPLE WATCH / ЧАСЫ ===')
  for (const p of watches) {
    const live = p.isAvailable && p.variants.some(v => v.inStock && v.quantity > 0)
    say(`  #${p.id} «${p.name}» [${live ? 'живой' : 'призрак'}] · вариантов ${p.variants.length}`)
  }

  // Пары «различаются наличием ровно одного атрибута» — только Apple Watch
  const apple = watches.filter(p => /apple\s*watch|watch\s*(s\d|se|ultra)/i.test(p.name))
  const plans: Array<Record<string, unknown>> = []

  for (const p of apple) {
    say(`\n\n════ #${p.id} «${p.name}» (вариантов ${p.variants.length}) ════`)
    const pairs: Array<{ withV: typeof p.variants[number]; withoutV: typeof p.variants[number]; key: string; value: string }> = []
    for (const v1 of p.variants) {
      const a1 = cleanAttrs(v1.attributes)
      for (const k of Object.keys(a1)) {
        for (const v2 of p.variants) {
          if (v2.id === v1.id) continue
          const a2 = cleanAttrs(v2.attributes)
          if (a2[k] !== undefined) continue
          if (keyWithout(a1, k) !== keyWithout(a2, k)) continue
          if (pairs.some(x => x.withV.id === v1.id && x.withoutV.id === v2.id)) continue
          pairs.push({ withV: v1, withoutV: v2, key: k, value: a1[k]! })
        }
      }
    }
    if (!pairs.length) { say('  пар нет'); continue }

    for (const pr of pairs) {
      const fn1 = String((pr.withV.attributes as Record<string, unknown>)?.fullName ?? '')
      const fn2 = String((pr.withoutV.attributes as Record<string, unknown>)?.fullName ?? '')
      const a1 = cleanAttrs(pr.withV.attributes)
      // Тип ремешка ищем в fullName обоих + в значении атрибута «Ремешок»
      const probe = [fn1, fn2, a1['Ремешок'] ?? ''].join(' ')
      const { klass, strap } = classify(probe)
      const isSizeValue = SIZE_TOKEN.test(pr.value.trim())

      say(`\n  ── пара: атрибут «${pr.key}» = «${pr.value}» ${isSizeValue ? '(это РАЗМЕР)' : '(не размер)'}`)
      say(`      c атрибутом  #${pr.withV.id} · остаток ${pr.withV.quantity}${pr.withV.inStock ? ', в наличии' : ''} · ${Number(pr.withV.price)} ₽`)
      say(`          fullName: ${fn1 || '—'}`)
      say(`      без атрибута #${pr.withoutV.id} · остаток ${pr.withoutV.quantity}${pr.withoutV.inStock ? ', в наличии' : ''} · ${Number(pr.withoutV.price)} ₽`)
      say(`          fullName: ${fn2 || '—'}`)
      say(`      тип ремешка: ${strap ?? '— не определён'} → ${klass}`)

      let verdict: string
      if (pr.key !== 'Ремешок' && !isSizeValue) {
        verdict = `СХЛОПЫВАТЬ можно (различие не в размере, а в «${pr.key}») — но это не Milanese/Link, выносим в отдельный шаг`
      } else if (klass === 'регулируемый') {
        verdict = 'ДУБЛЬ: ремешок регулируемый, размера S/M–M/L у него не существует → лишний размер убрать, схлопнуть'
      } else if (klass === 'с размером') {
        verdict = 'НЕ СХЛОПЫВАТЬ: размер реальный (Sport/Solo/Braided/Alpine) → отдельный шаг после сверки'
      } else {
        verdict = 'СПОРНО: тип ремешка не определить → не трогать'
      }
      say(`      вердикт: ${verdict}`)
      plans.push({
        productId: p.id, productName: p.name, attrKey: pr.key, attrValue: pr.value,
        withVariantId: pr.withV.id, withoutVariantId: pr.withoutV.id,
        strap, klass, isSizeValue, verdict,
        collapseNow: klass === 'регулируемый' && (pr.key === 'Ремешок' || isSizeValue),
      })
    }
  }

  // ── Прямая проверка регулируемых: лишний размер и дубли между ними ────────
  say(`\n\n════ РЕГУЛИРУЕМЫЕ РЕМЕШКИ (Milanese / Link) — прямая проверка ════`)
  let adjTotal = 0, adjWithSize = 0
  const adjDupes: string[] = []
  for (const p of apple) {
    const adj = p.variants.filter(v => {
      const a = cleanAttrs(v.attributes)
      const fn = String((v.attributes as Record<string, unknown>)?.fullName ?? '')
      return ADJUSTABLE.some(x => x.re.test(`${fn} ${a['Ремешок'] ?? ''}`))
    })
    if (!adj.length) continue
    adjTotal += adj.length
    say(`\n  #${p.id} «${p.name}»: регулируемых вариантов ${adj.length}`)
    const seen = new Map<string, number>()
    for (const v of adj) {
      const a = cleanAttrs(v.attributes)
      const bogusSize = SIZE_TOKEN.test((a['Ремешок'] ?? '').trim()) || SIZE_TOKEN.test((a['Размер ремешка'] ?? '').trim())
      if (bogusSize) adjWithSize++
      const k = Object.entries(a).filter(([kk]) => kk !== 'Ремешок' || !SIZE_TOKEN.test(a[kk]!.trim()))
        .map(([kk, vv]) => `${kk}=${vv.toLowerCase()}`).sort().join(' | ')
      say(`      #${v.id} · ${a['Ремешок'] ?? '—'} · остаток ${v.quantity}${bogusSize ? ' · ⚠ ЛИШНИЙ РАЗМЕР' : ''}`)
      if (seen.has(k)) adjDupes.push(`#${seen.get(k)} ↔ #${v.id} (товар #${p.id})`)
      else seen.set(k, v.id)
    }
  }
  say(`\n  Итого регулируемых вариантов: ${adjTotal}`)
  say(`  Из них с лишним размером S/M–M/L: ${adjWithSize}`)
  say(`  Дублей между регулируемыми: ${adjDupes.length}${adjDupes.length ? ' → ' + adjDupes.join(', ') : ''}`)

  const now = plans.filter(p => p.collapseNow)
  say(`\n\n════ ИТОГО ════`)
  say(`  Пар разобрано: ${plans.length}`)
  say(`  В Phase 1 сейчас (регулируемые Milanese/Link): ${now.length}`)
  say(`  Отложено (Sport/Solo/Braided/Alpine — размер реальный): ${plans.filter(p => p.klass === 'с размером').length}`)
  say(`  Спорных (тип не определён, не трогаем): ${plans.filter(p => p.klass === 'спорный').length}`)

  const file = path.resolve(__dirname, '../reports/watch-straps-2026-08-26.txt')
  fs.writeFileSync(file, out.join('\n'))
  fs.writeFileSync(path.resolve(__dirname, '../reports/watch-straps-2026-08-26.json'), JSON.stringify(plans, null, 2))
  console.log('\nОтчёт: ' + file)
}

main().finally(() => prisma.$disconnect())
