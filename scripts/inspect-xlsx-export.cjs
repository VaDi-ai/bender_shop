'use strict'
/** Одноразовый разбор экспорта xlsx для сверки с Google Sheets-пайплайном. */
const path = process.argv[2]
if (!path) {
  console.error('Usage: node scripts/inspect-xlsx-export.cjs <path.xlsx>')
  process.exit(1)
}

async function main() {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const labels = []

  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    let t = ''
    if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value)
      t = cell.value.richText?.map(x => x.text).join('') ?? ''
    else t = String(cell.text ?? cell.value ?? '').trim()
    labels[colNum] = t.trim()
  })

  console.log('Sheet:', ws.name)
  console.log('RowCount:', ws.rowCount)

  const colBy = (pred) => {
    for (let c = 1; c < labels.length; c++) {
      const s = labels[c] ?? ''
      if (!s) continue
      try {
        if (pred(s)) return c
      } catch (_) {
        /**/
      }
    }
    return -1
  }

  const cn = {
    brand: colBy(s => /^бренд$/i.test(s) || /^brand$/i.test(s)),
    category: colBy(s => /общая категория/i.test(s) || (/^категория$/i.test(s) && !/поставщик/i.test(s))),
    fullName: colBy(
      s => /название модели/i.test(s) || (/^название$/i.test(s) && !s.includes('Вид')),
    ),
    color: colBy(s => /^цвет$/i.test(s) || /^color$/i.test(s)),
    photo: colBy(
      s =>
        /^фото$/i.test(s) ||
        /^photo$/i.test(s) ||
        (/фото/i.test(s) &&
          !s.toLowerCase().includes('описание') &&
          !s.toLowerCase().includes('характер')),
    ),
    price: colBy(s =>
      [/рекомендованная стоимость/i, /рекомендованная/i].some(rx => rx.test(s)),
    ),
  }

  console.log('\nРазметка заголовков (1-based номер столбца):')
  for (let i = 1; i <= 20 && i < labels.length; i++) {
    if (labels[i]) console.log(`  ${i}: ${labels[i]}`)
  }
  console.log('\nНайденные ключевые столбцы:', JSON.stringify(cn, null, 2))

  if (cn.photo <= 0) {
    console.log('\nNO_PHOTO_COLUMN — синк может не брать ваши фото!')
    process.exit(0)
    return
  }

  let dataRows = 0
  let withHttps = 0
  let hyperlinks = 0
  /** @type {string[]} */
  const samplesHttps = []
  /** @type {string[]} */
  const samplesHyperlink = []

  for (let r = 2; r <= ws.rowCount && r <= 50000; r++) {
    const row = ws.getRow(r)
    const fullCell = cn.fullName > 0 ? row.getCell(cn.fullName) : null
    const full = fullCell
      ? String(fullCell.text ?? fullCell.value ?? '')
          .replace(/\uFEFF/g, '')
          .trim()
      : ''
    if (!full) continue
    dataRows++

    const c = row.getCell(cn.photo)
    /** @type {string} */
    let text = ''

    const v = c.value
    if (typeof v === 'object' && v !== null && 'hyperlink' in v) {
      hyperlinks++
      const h = typeof v.hyperlink === 'string' ? v.hyperlink : ''
      const tx = typeof v.text === 'string' ? v.text : ''
      text = tx || h
      if (
        hyperlinks <= 2 &&
        (samplesHyperlink.length < 2 || !samplesHyperlink.some(x => x.startsWith('row ' + r)))
      ) {
        samplesHyperlink.push(
          `row ${r}: link=${JSON.stringify(String(h).slice(0, 80))} text=${JSON.stringify(String(tx).slice(0, 60))}`,
        )
      }
    } else text = String(c.text ?? c.value ?? '').trim()

    if (/https?:\/\//i.test(text)) {
      withHttps++
      if (samplesHttps.length < 2) samplesHttps.push(`row ${r}: ${text.slice(0, 110)}`)
    }
  }

  console.log('\nПодсчёт (по строкам с непустым «Название модели»):')
  console.log('  строк данных:', dataRows)
  console.log('  ячейки Фото с типом hyperlink (формула/гиперссылка Excel):', hyperlinks)
  console.log('  строк где текст Фото содержит https:', withHttps)

  if (samplesHyperlink.length) console.log('\nПример HYPERLINK-ячейки:\n ', samplesHyperlink.join('\n  '))
  if (samplesHttps.length) console.log('\nПример текста с https:\n ', samplesHttps.join('\n  '))

  console.log('\n--- Про пайплайн ---')
  console.log(
    'Google Sheets API отдаёт в ячейке обычно отображаемый текст.\nЕсли там не https, а только подпись — parsePhotoUrls в коде может вернуть []. Экспорт в xlsx сохраняет hyperlink отдельно — см. samples выше.',
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
