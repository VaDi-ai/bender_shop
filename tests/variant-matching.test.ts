/**
 * Матчинг вариантов витрины: пустой ключ атрибута = wildcard, а не «не
 * совпало» — ни один in-stock вариант не должен быть недостижим из пикера
 * (репро-баг: титановые Watch S11 без «Связь» при автоселекте «GPS»).
 *
 * Тестируем РЕАЛЬНЫЙ код витрины: блок между PURE-VARIANT-MATCH-START/END в
 * webapp/index.html извлекается и выполняется как есть — тест упадёт и если
 * логика сломается, и если блок переименуют/уберут.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const html = fs.readFileSync(path.join(__dirname, '../webapp/index.html'), 'utf8')
const m = html.match(/\/\/ ─── PURE-VARIANT-MATCH-START ─+([\s\S]*?)\/\/ ─── PURE-VARIANT-MATCH-END ─+/)
if (!m) throw new Error('PURE-VARIANT-MATCH блок не найден в webapp/index.html')

/* eslint-disable @typescript-eslint/no-explicit-any */
const helpers = new Function(`${m[1]}
  return { attrValueOf, variantMatchesSelected, pickVariantForSelection, allInStockHaveKey, resolveSelection }`)() as any
const { variantMatchesSelected, pickVariantForSelection, allInStockHaveKey, resolveSelection } = helpers

// Watch S11 в миниатюре: алюминий с «Связь: GPS», титан — БЕЗ ключа «Связь»
const KEYS = ['Цвет', 'Связь', 'Размер', 'Ремешок', 'Материал']
const alu = (id: number, color: string, size: string, strap: string) => ({
  id, inStock: true,
  attributes: { 'Цвет': color, 'Связь': 'GPS', 'Размер': size, 'Ремешок': strap, 'Материал': 'Aluminum' },
})
const titan = (id: number, color: string, size: string) => ({
  id, inStock: true,
  attributes: { 'Цвет': color, 'Размер': size, 'Ремешок': 'Milanese Loop', 'Материал': 'Titanium' },
})
const watch = [
  alu(1, 'Jet Black', '42mm', 'S/M'), alu(2, 'Jet Black', '46mm', 'M/L'),
  titan(3, 'Gold Titanium', '42mm'), titan(4, 'Natural Titanium', '46mm'),
]

describe('wildcard: пустой ключ совместим с любым выбором', () => {
  it('титан без «Связь» матчится и при выбранной «Связь: GPS»', () => {
    expect(variantMatchesSelected(titan(3, 'Gold Titanium', '42mm'), { 'Связь': 'GPS', 'Цвет': 'Gold Titanium' })).toBe(true)
  })

  it('заполненный ключ по-прежнему требует точного равенства', () => {
    expect(variantMatchesSelected(alu(1, 'Jet Black', '42mm', 'S/M'), { 'Цвет': 'Gray' })).toBe(false)
  })
})

describe('pickVariantForSelection', () => {
  it('титан выбираем: репро Watch S11 — Gold Titanium достижим при автовыборе GPS', () => {
    expect(pickVariantForSelection(watch, { 'Связь': 'GPS', 'Цвет': 'Gold Titanium', 'Размер': '42mm' })!.id).toBe(3)
  })

  it('ВСЕ in-stock достижимы: выбор собственных атрибутов варианта находит его', () => {
    for (const v of watch) {
      const picked = pickVariantForSelection(watch, v.attributes)
      expect(picked, `вариант ${v.id} недостижим`).not.toBeNull()
      expect(picked!.id).toBe(v.id)
    }
  })

  it('точное совпадение главнее wildcard: безключевой не перехватывает выбор с ключом', () => {
    const withSim = { id: 11, inStock: true, attributes: { 'Цвет': 'White', 'SIM': 'SIM + eSIM' } }
    const noSim = { id: 12, inStock: true, attributes: { 'Цвет': 'White' } }
    expect(pickVariantForSelection([noSim, withSim], { 'Цвет': 'White', 'SIM': 'SIM + eSIM' })!.id).toBe(11)
  })

  it('out-of-stock не выбирается даже при точном совпадении; пустой выбор → null', () => {
    const out = { id: 21, inStock: false, attributes: { 'Цвет': 'Blue' } }
    expect(pickVariantForSelection([out], { 'Цвет': 'Blue' })).toBeNull()
    expect(pickVariantForSelection(watch, {})).toBeNull()
  })
})

describe('автоселект единственного значения', () => {
  it('НЕ автоселектим ключ, которого нет хотя бы у одного in-stock варианта', () => {
    expect(allInStockHaveKey(watch, 'Связь')).toBe(false)     // титан без «Связь»
  })

  it('все с ключом — поведение как раньше (автоселект разрешён)', () => {
    expect(allInStockHaveKey(watch, 'Цвет')).toBe(true)
    expect(allInStockHaveKey(watch, 'Материал')).toBe(true)
    // out-of-stock без ключа автоселекту не мешает
    const withOut = [...watch, { id: 9, inStock: false, attributes: {} }]
    expect(allInStockHaveKey(withOut, 'Цвет')).toBe(true)
  })
})

describe('resolveSelection — гейт «Взять у Бендера»', () => {
  it('титан покупается без выбора «Связь»: выбор его атрибутов однозначен', () => {
    const { resolved } = resolveSelection(watch, titan(3, 'Gold Titanium', '42mm').attributes, KEYS)
    expect(resolved).toBe(true)
  })

  it('частичный выбор с несколькими кандидатами — не resolved (кнопка ждёт)', () => {
    const { resolved, matching } = resolveSelection(watch, { 'Цвет': 'Jet Black' }, KEYS)
    expect(resolved).toBe(false)
    expect(matching).toHaveLength(2)
  })

  it('несовместимый выбор → matching пуст (кнопка покажет «нет в наличии»)', () => {
    const { matching } = resolveSelection(watch, { 'Цвет': 'Jet Black', 'Размер': '49mm' }, KEYS)
    expect(matching).toHaveLength(0)
  })

  it('точный приоритет: выбор SIM разрешается в пользу варианта С ключом', () => {
    const pair = [
      { id: 11, inStock: true, attributes: { 'Цвет': 'White', 'SIM': 'SIM + eSIM' } },
      { id: 12, inStock: true, attributes: { 'Цвет': 'White', 'Память': '256GB' } },
    ]
    const { resolved } = resolveSelection(pair, { 'Цвет': 'White', 'SIM': 'SIM + eSIM' }, ['Цвет', 'SIM', 'Память'])
    expect(resolved).toBe(true)
  })

  it('дубли строк с одинаковыми атрибутами считаются одним вариантом', () => {
    const dup = [alu(1, 'Jet Black', '42mm', 'S/M'), { ...alu(1, 'Jet Black', '42mm', 'S/M'), id: 99 }]
    const { resolved } = resolveSelection(dup, alu(1, 'Jet Black', '42mm', 'S/M').attributes, KEYS)
    expect(resolved).toBe(true)
  })
})
