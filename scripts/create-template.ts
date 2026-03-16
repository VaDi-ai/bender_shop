/**
 * scripts/create-template.ts
 *
 * Генерирует Excel-шаблон для импорта товаров и оприходования.
 * Запуск: npx ts-node scripts/create-template.ts
 * Результат: public/template.xlsx
 *
 * Листы:
 *   1. «Товары и варианты» — один товар = несколько строк (по одной на вариант)
 *   2. «Характеристики»    — технические характеристики товаров (specs)
 *   3. «Оприходование»     — изменение остатков по SKU варианта
 */

import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'

// ─── Стили ───────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2B579A' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
}

const REQUIRED_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
}

const EXAMPLE_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FF856404' },
  italic: true,
}

const EXAMPLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF3CD' },
}

function styleHeaderRow(
  row: ExcelJS.Row,
  requiredCols: number[] = [],
): void {
  row.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL
    cell.font = requiredCols.includes(colNumber) ? REQUIRED_FONT : HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF2B579A' } },
    }
  })
  row.height = 28
}

function styleExampleRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = EXAMPLE_FONT
    cell.fill = EXAMPLE_FILL
  })
}

// ─── Главная функция ─────────────────────────────────────────────────────────

async function createTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Bender Shop'
  workbook.created = new Date()

  // ═══════════════════════════════════════════════════════════════════════════
  // ЛИСТ 1: Товары и варианты
  // ═══════════════════════════════════════════════════════════════════════════

  const sheet1 = workbook.addWorksheet('Товары и варианты')

  // A=25, B=15, C=15, D=10, E=30, F=25, G=12, H=10, I-N=15
  sheet1.columns = [
    { key: 'name',    width: 25 },  // A — Название товара*
    { key: 'brand',   width: 15 },  // B — Бренд
    { key: 'cat',     width: 15 },  // C — Категория*
    { key: 'badge',   width: 10 },  // D — Метка
    { key: 'desc',    width: 30 },  // E — Описание
    { key: 'sku',     width: 25 },  // F — SKU варианта*
    { key: 'price',   width: 12 },  // G — Цена варианта*
    { key: 'qty',     width: 10 },  // H — Количество*
    { key: 'a1n',     width: 15 },  // I — Атрибут1_Название
    { key: 'a1v',     width: 15 },  // J — Атрибут1_Значение
    { key: 'a2n',     width: 15 },  // K — Атрибут2_Название
    { key: 'a2v',     width: 15 },  // L — Атрибут2_Значение
    { key: 'a3n',     width: 15 },  // M — Атрибут3_Название
    { key: 'a3v',     width: 15 },  // N — Атрибут3_Значение
  ]

  // Заголовок
  sheet1.addRow([
    'Название товара*',
    'Бренд',
    'Категория*',
    'Метка',
    'Описание',
    'SKU варианта*',
    'Цена варианта*',
    'Количество*',
    'Атрибут1_Название',
    'Атрибут1_Значение',
    'Атрибут2_Название',
    'Атрибут2_Значение',
    'Атрибут3_Название',
    'Атрибут3_Значение',
  ])
  styleHeaderRow(sheet1.getRow(1), [1, 3, 6, 7, 8])

  // Заметки к обязательным колонкам
  sheet1.getCell('A1').note = 'Одинаковое для всех строк одного товара'
  sheet1.getCell('C1').note = 'Название категории (создаётся автоматически)'
  sheet1.getCell('D1').note = 'Только в первой строке товара. Значения: ХИТ, НОВИНКА, АКЦИЯ'
  sheet1.getCell('E1').note = 'Только в первой строке товара'
  sheet1.getCell('F1').note = 'Уникальный артикул конкретного варианта'
  sheet1.getCell('G1').note = 'Цена в рублях (число)'
  sheet1.getCell('H1').note = 'Остаток на складе (целое число ≥ 0)'

  // Примеры — iPhone 17 Pro (3 варианта)
  const exRows: Array<Array<string | number>> = [
    ['iPhone 17 Pro', 'Apple', 'Телефоны', 'НОВИНКА', 'Флагман Apple', 'IPHONE17PRO-256-ORG', 109990, 5, 'Цвет', 'Cosmic Orange', 'Память', '256 ГБ', '', ''],
    ['iPhone 17 Pro', '',      '',          '',        '',               'IPHONE17PRO-256-BLU', 109990, 3, 'Цвет', 'Deep Blue',     'Память', '256 ГБ', '', ''],
    ['iPhone 17 Pro', '',      '',          '',        '',               'IPHONE17PRO-512-ORG', 129990, 2, 'Цвет', 'Cosmic Orange', 'Память', '512 ГБ', '', ''],
    ['MacBook Air M4','Apple', 'Ноутбуки',  'ХИТ',    'Ультратонкий',   'MACBOOK-M4-16-256-MN',119990, 2, 'Цвет', 'Midnight',      'Память', '16 ГБ', 'Накопитель', '256 ГБ'],
    ['MacBook Air M4','',      '',           '',       '',               'MACBOOK-M4-16-512-ST',139990, 2, 'Цвет', 'Starlight',     'Память', '16 ГБ', 'Накопитель', '512 ГБ'],
  ]

  for (const rowData of exRows) {
    styleExampleRow(sheet1.addRow(rowData))
  }

  sheet1.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A8' }]

  // ═══════════════════════════════════════════════════════════════════════════
  // ЛИСТ 2: Характеристики
  // ═══════════════════════════════════════════════════════════════════════════

  const sheet2 = workbook.addWorksheet('Характеристики')

  sheet2.columns = [
    { key: 'name',  width: 25 },  // A — Название товара*
    { key: 'spec',  width: 25 },  // B — Характеристика*
    { key: 'value', width: 35 },  // C — Значение*
  ]

  sheet2.addRow(['Название товара*', 'Характеристика*', 'Значение*'])
  styleHeaderRow(sheet2.getRow(1), [1, 2, 3])

  sheet2.getCell('A1').note = 'Должно совпадать с Названием товара на листе «Товары и варианты»'
  sheet2.getCell('B1').note = 'Например: Процессор, Дисплей, Камера'
  sheet2.getCell('C1').note = 'Например: A19 Pro, 6.3" Super Retina XDR'

  const specRows: Array<[string, string, string]> = [
    ['iPhone 17 Pro', 'Процессор', 'A19 Pro'],
    ['iPhone 17 Pro', 'Дисплей',   '6.3" Super Retina XDR 120 Гц'],
    ['iPhone 17 Pro', 'Камера',    'Тройная 48 МП'],
    ['iPhone 17 Pro', 'Батарея',   'До 27 часов'],
    ['MacBook Air M4','Процессор', 'Apple M4'],
    ['MacBook Air M4','Дисплей',   '13.6" Liquid Retina'],
    ['MacBook Air M4','Батарея',   'До 18 часов'],
  ]

  for (const rowData of specRows) {
    styleExampleRow(sheet2.addRow(rowData))
  }

  sheet2.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A9' }]

  // ═══════════════════════════════════════════════════════════════════════════
  // ЛИСТ 3: Оприходование
  // ═══════════════════════════════════════════════════════════════════════════

  const sheet3 = workbook.addWorksheet('Оприходование')

  sheet3.columns = [
    { key: 'sku',     width: 25 },  // A — SKU варианта*
    { key: 'qty',     width: 15 },  // B — Количество*
    { key: 'comment', width: 35 },  // C — Комментарий
  ]

  sheet3.addRow(['SKU варианта*', 'Количество*', 'Комментарий'])
  styleHeaderRow(sheet3.getRow(1), [1, 2])

  sheet3.getCell('A1').note = 'Артикул варианта товара (из колонки F листа «Товары и варианты»)'
  sheet3.getCell('B1').note = 'Положительное — приход. Отрицательное — списание.'

  styleExampleRow(sheet3.addRow(['IPHONE17PRO-256-ORG', 10, 'Приход со склада']))
  styleExampleRow(sheet3.addRow(['MACBOOK-M4-16-256-MN', -2, 'Возврат поставщику']))

  sheet3.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A4' }]

  // ═══════════════════════════════════════════════════════════════════════════
  // Сохранение
  // ═══════════════════════════════════════════════════════════════════════════

  const publicDir = path.join(process.cwd(), 'public')
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

  const outPath = path.join(publicDir, 'template.xlsx')
  await workbook.xlsx.writeFile(outPath)
  console.log('✅ Шаблон создан:', outPath)
}

createTemplate().catch((err) => {
  console.error('❌ Ошибка:', err)
  process.exit(1)
})
