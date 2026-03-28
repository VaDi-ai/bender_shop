import 'dotenv/config'
import { prisma } from '../lib/prisma'

interface Issue {
  productId: number
  productName: string
  category: string
  issue: string
}

async function main() {
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    include: { category: true, variants: true },
  })

  const issues: Issue[] = []

  for (const p of products) {
    const cat = p.category?.name || 'Unknown'
    const attrs = (p.attributes as Record<string, string[]>) || {}
    const name = p.name

    // 1. Память содержит "/" (не разделена на RAM + Storage)
    if (attrs['Память']) {
      for (const val of attrs['Память']) {
        if (val.includes('/')) {
          issues.push({ productId: p.id, productName: name, category: cat, issue: `Память содержит "/": "${val}" — нужно разделить на RAM + Storage` })
        }
      }
    }

    // 2. Дубль Экран/Размер
    if (attrs['Экран'] && attrs['Размер']) {
      const screenVals = JSON.stringify(attrs['Экран'])
      const sizeVals = JSON.stringify(attrs['Размер'])
      if (screenVals === sizeVals) {
        issues.push({ productId: p.id, productName: name, category: cat, issue: `Дубль: Экран=${screenVals} и Размер=${sizeVals} одинаковые` })
      }
    }

    // 3. Desktop/iMac с "Размер" вместо "Экран"
    if ((cat === 'Desktop' || /imac/i.test(name)) && attrs['Размер'] && !attrs['Экран']) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'Desktop с "Размер" вместо "Экран"' })
    }

    // 4. Телефоны без Память
    if (cat === 'Телефоны' && !attrs['Память']) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'Телефон без атрибута Память' })
    }

    // 5. Телефоны без Цвет
    if (cat === 'Телефоны' && !attrs['Цвет']) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'Телефон без атрибута Цвет' })
    }

    // 6. iPhone без SIM
    if (/iphone/i.test(name) && !attrs['SIM']) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'iPhone без атрибута SIM' })
    }

    // 7. Планшеты без Связь
    if (cat === 'Планшеты' && !attrs['Связь']) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'Планшет без атрибута Связь' })
    }

    // 8. Ноутбуки без Экран
    if ((cat === 'Ноутбуки' || cat === 'Ноутбуки и компьютеры') && !attrs['Экран']) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'Ноутбук без атрибута Экран' })
    }

    // 9. Часы без Размер
    if (cat === 'Часы' && !attrs['Размер'] && !/airpods|earpods/i.test(name)) {
      issues.push({ productId: p.id, productName: name, category: cat, issue: 'Часы без атрибута Размер' })
    }

    // 10. Цвет с маленькой буквы
    if (attrs['Цвет']) {
      for (const val of attrs['Цвет']) {
        if (val && /^[a-zа-я]/.test(val) && !/^eSIM|^i/.test(val)) {
          issues.push({ productId: p.id, productName: name, category: cat, issue: `Цвет с маленькой буквы: "${val}"` })
        }
      }
    }

    // 11. Пустые массивы атрибутов
    for (const [key, vals] of Object.entries(attrs)) {
      if (Array.isArray(vals) && vals.length === 0) {
        issues.push({ productId: p.id, productName: name, category: cat, issue: `Пустой атрибут: ${key} = []` })
      }
    }

    // 12. Варианты без атрибутов
    if (p.variants.length > 1) {
      for (const v of p.variants) {
        const vAttrs = (v.attributes as Record<string, string>) || {}
        if (Object.keys(vAttrs).length === 0) {
          issues.push({ productId: p.id, productName: name, category: cat, issue: `Вариант ${v.sku} без атрибутов` })
        }
      }
    }
  }

  // Сводка
  console.log('\n=== АУДИТ АТРИБУТОВ ===')
  console.log(`Проверено: ${products.length} товаров`)
  console.log(`Найдено проблем: ${issues.length}\n`)

  // Группировка по типу проблемы
  const byIssue = new Map<string, number>()
  for (const i of issues) {
    const key = i.issue.replace(/".+?"/g, '"..."').replace(/\d+/g, 'N')
    byIssue.set(key, (byIssue.get(key) || 0) + 1)
  }

  console.log('По типам:')
  for (const [issue, count] of [...byIssue.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x — ${issue}`)
  }

  // Детали (первые 30)
  console.log('\nДетали (первые 30):')
  for (const i of issues.slice(0, 30)) {
    console.log(`  [${i.category}] ${i.productName} (#${i.productId}): ${i.issue}`)
  }

  if (issues.length > 30) {
    console.log(`  ... и ещё ${issues.length - 30}`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
