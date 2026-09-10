/**
 * Блок «Рекомендуем» в карточке админки — на живой разметке из webapp/admin.html.
 *
 * Проверяем то, что владелец видит глазами: замена подписана как замена и
 * присутствует в блоке ВСЕГДА, у авто-позиций стоит, откуда они взялись, а
 * кнопки сохранения есть только у владельца.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ADMIN = join(__dirname, '..', 'webapp', 'admin.html')

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`webapp/admin.html: не нашли function ${name}()`)
  let depth = 0
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error(`webapp/admin.html: не сошлись скобки у ${name}()`)
}

/** Собирает pcRecsBlock с минимальными заглушками его зависимостей. */
function loadBlock() {
  const src = readFileSync(ADMIN, 'utf8')
  const label = src.slice(src.indexOf('const REC_SOURCE_LABEL = {'), src.indexOf('}', src.indexOf('const REC_SOURCE_LABEL = {')) + 1)
  const body = [
    'const esc = s => String(s == null ? "" : s)',
    'const fmt = n => String(n)',
    'const sfThumb = url => `<i data-thumb="${url || ""}"></i>`',
    label,
    extractFunction(src, 'recsManualArray'),
    extractFunction(src, 'pcRecsBlock'),
  ].join('\n')
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${body}\nreturn { pcRecsBlock, recsManualArray }`)() as {
    pcRecsBlock(p: unknown, isOwner: boolean): string
    recsManualArray(p: unknown): number[]
  }
}

const { pcRecsBlock, recsManualArray } = loadBlock()

const card = (slots: unknown[], manual: number[] = []) => ({
  id: 1,
  recommendations: { slots, manual, limit: 4 },
})

const slot = (position: number, productId: number, name: string, source: string, onStorefront = true) =>
  ({ position, productId, name, source, onStorefront, photoUrl: null, price: 1000 })

const AUTO = [
  slot(1, 2, 'AirPods Pro 3', 'accessory'),
  slot(2, 3, 'Чехол MagSafe', 'accessory'),
  slot(3, 5, 'MacBook Air M5', 'related'),
  slot(4, 7, 'iPhone 17', 'similar'),
]

describe('что видит владелец', () => {
  it('у каждой авто-позиции подписано, откуда она', () => {
    const html = pcRecsBlock(card(AUTO), true)
    expect(html).toContain('авто · аксессуар')
    expect(html).toContain('авто · сопутствующий')
    expect(html).toContain('авто · похожий по цене')
    expect(html).toContain('Подобрано автоматически по бренду и категории')
  })

  it('ручная замена видна в блоке и подписана как замена', () => {
    const slots = [AUTO[0], AUTO[1], slot(3, 42, 'AirTag', 'manual'), AUTO[3]]
    const html = pcRecsBlock(card(slots, [0, 0, 42]), true)
    expect(html).toContain('AirTag')
    expect(html).toContain('вручную')
    expect(html).toContain('замена')
    expect(html).toContain('3. AirTag')            // стоит на своём слоте, а не уехала в начало
  })

  it('закреплённый товар вне витрины видно — с честной оговоркой', () => {
    const slots = [AUTO[0], AUTO[1], slot(3, 42, 'AirTag', 'manual', false), AUTO[3]]
    const html = pcRecsBlock(card(slots, [0, 0, 42]), true)
    expect(html).toContain('AirTag')
    expect(html).toContain('нет на витрине')
  })

  it('«Вернуть авто» есть только у ручной позиции', () => {
    const slots = [AUTO[0], slot(2, 42, 'AirTag', 'manual'), AUTO[2], AUTO[3]]
    const html = pcRecsBlock(card(slots, [0, 42]), true)
    expect(html).toContain('data-rec-auto="2"')
    expect(html).not.toContain('data-rec-auto="1"')
  })

  it('«Сбросить всё» появляется только когда есть что сбрасывать', () => {
    expect(pcRecsBlock(card(AUTO), true)).not.toContain('recReset')
    const slots = [AUTO[0], AUTO[1], slot(3, 42, 'AirTag', 'manual'), AUTO[3]]
    expect(pcRecsBlock(card(slots, [0, 0, 42]), true)).toContain('recReset')
  })
})

describe('менеджер', () => {
  it('видит ленту, но не кнопки', () => {
    const slots = [AUTO[0], AUTO[1], slot(3, 42, 'AirTag', 'manual'), AUTO[3]]
    const html = pcRecsBlock(card(slots, [0, 0, 42]), false)
    expect(html).toContain('AirTag')                       // смотреть можно
    expect(html).not.toContain('data-rec-pick')            // менять — нет
    expect(html).not.toContain('data-rec-auto')
    expect(html).not.toContain('recReset')
    expect(html).toContain('Ленту меняет только владелец')
  })
})

describe('массив слотов для сохранения', () => {
  it('добивается нулями до полной ленты — индекс равен слоту', () => {
    expect(recsManualArray(card(AUTO, [0, 0, 42]))).toEqual([0, 0, 42, 0])
    expect(recsManualArray(card(AUTO, []))).toEqual([0, 0, 0, 0])
  })
})
