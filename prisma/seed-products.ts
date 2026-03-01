import { prisma } from '../lib/prisma'

async function main() {
  // ── 1. Очистка ──────────────────────────────────────────────────────────────
  await prisma.reservation.deleteMany({})
  await prisma.productVariant.deleteMany({})
  await prisma.order.deleteMany({})
  await prisma.product.deleteMany({})
  await prisma.category.deleteMany({})
  console.log('Очищены: резервации, варианты, заказы, товары, категории')

  // ── 2. Категория «Телефоны» ─────────────────────────────────────────────────
  const catPhones = await prisma.category.upsert({
    where: { name: 'Телефоны' },
    update: {},
    create: { name: 'Телефоны' },
  })

  // ── 3. iPhone 17 Pro ─────────────────────────────────────────────────────────
  const iphone = await prisma.product.create({
    data: {
      sku: 'IPH17PRO',
      name: 'iPhone 17 Pro',
      brand: 'Apple',
      badge: 'НОВИНКА',
      description:
        'iPhone 17 Pro — первый iPhone с алюминиевым корпусом вместо титанового. Чип A19 Pro, тройная камера 48 МП, дисплей 6.3 дюйма Super Retina XDR с ProMotion 120 Гц, рекордное время работы от батареи.',
      price: 109990,
      stock: 18,
      quantity: 18,
      isAvailable: true,
      categoryId: catPhones.id,
      photos: [],
      specs: {
        Чип: 'A19 Pro',
        Дисплей: '6.3" Super Retina XDR, 120 Гц',
        Камера: 'Тройная 48 МП (основная + ультраширокая + телефото 8×)',
        Фронтальная: '18 МП Centre Stage',
        Корпус: 'Алюминий + Ceramic Shield 2',
        Связь: '5G, Wi-Fi 7, Bluetooth 6',
        USB: 'USB-C (USB 3)',
        Батарея: 'До 27 часов воспроизведения видео',
      },
      attributes: {
        Цвет: ['Cosmic Orange', 'Deep Blue', 'Silver'],
        Память: ['256 ГБ', '512 ГБ', '1 ТБ'],
      },
    },
  })

  const iphoneVariants = [
    { color: 'Cosmic Orange', colorCode: 'CO', storage: '256 ГБ', storageCode: '256', price: 109990, qty: 3 },
    { color: 'Cosmic Orange', colorCode: 'CO', storage: '512 ГБ', storageCode: '512', price: 129990, qty: 2 },
    { color: 'Cosmic Orange', colorCode: 'CO', storage: '1 ТБ',   storageCode: '1TB', price: 149990, qty: 1 },
    { color: 'Deep Blue',     colorCode: 'DB', storage: '256 ГБ', storageCode: '256', price: 109990, qty: 3 },
    { color: 'Deep Blue',     colorCode: 'DB', storage: '512 ГБ', storageCode: '512', price: 129990, qty: 2 },
    { color: 'Deep Blue',     colorCode: 'DB', storage: '1 ТБ',   storageCode: '1TB', price: 149990, qty: 1 },
    { color: 'Silver',        colorCode: 'SL', storage: '256 ГБ', storageCode: '256', price: 109990, qty: 3 },
    { color: 'Silver',        colorCode: 'SL', storage: '512 ГБ', storageCode: '512', price: 129990, qty: 2 },
    { color: 'Silver',        colorCode: 'SL', storage: '1 ТБ',   storageCode: '1TB', price: 149990, qty: 1 },
  ]

  for (const v of iphoneVariants) {
    await prisma.productVariant.create({
      data: {
        productId: iphone.id,
        sku: `IPH17PRO-${v.colorCode}-${v.storageCode}`,
        price: v.price,
        quantity: v.qty,
        inStock: v.qty > 0,
        photos: [],
        attributes: { Цвет: v.color, Память: v.storage },
      },
    })
  }
  console.log(`iPhone 17 Pro: создан с ${iphoneVariants.length} вариантами`)

  // ── 4. MacBook Air M4 ────────────────────────────────────────────────────────
  const macbook = await prisma.product.create({
    data: {
      sku: 'MBAM4',
      name: 'MacBook Air M4',
      brand: 'Apple',
      badge: 'ХИТ',
      description:
        'MacBook Air на чипе M4 — самый тонкий и лёгкий ноутбук Apple. Дисплей Liquid Retina 13.6 дюйма, до 18 часов работы от батареи, унифицированная память до 32 ГБ.',
      price: 119990,
      stock: 12,
      quantity: 12,
      isAvailable: true,
      categoryId: catPhones.id,
      photos: [],
      specs: {
        Чип: 'Apple M4',
        Дисплей: '13.6" Liquid Retina, 2560×1664',
        Камера: '12 МП Center Stage',
        Батарея: 'До 18 часов',
        Разъёмы: '2× Thunderbolt 4, MagSafe 3, 3.5 мм',
        'Wi-Fi': 'Wi-Fi 6E',
        Вес: '1.24 кг',
      },
      attributes: {
        Цвет: ['Midnight', 'Starlight', 'Sky Blue', 'Silver'],
        Память: ['16 ГБ', '24 ГБ', '32 ГБ'],
        Накопитель: ['256 ГБ', '512 ГБ', '1 ТБ'],
      },
    },
  })

  const macbookVariants = [
    { color: 'Midnight',  cc: 'MN', ram: '16 ГБ', rc: '16', ssd: '256 ГБ', sc: '256', price: 119990, qty: 2 },
    { color: 'Midnight',  cc: 'MN', ram: '16 ГБ', rc: '16', ssd: '512 ГБ', sc: '512', price: 139990, qty: 2 },
    { color: 'Starlight', cc: 'ST', ram: '16 ГБ', rc: '16', ssd: '256 ГБ', sc: '256', price: 119990, qty: 2 },
    { color: 'Starlight', cc: 'ST', ram: '24 ГБ', rc: '24', ssd: '512 ГБ', sc: '512', price: 149990, qty: 2 },
    { color: 'Sky Blue',  cc: 'SB', ram: '16 ГБ', rc: '16', ssd: '256 ГБ', sc: '256', price: 119990, qty: 1 },
    { color: 'Silver',    cc: 'SL', ram: '16 ГБ', rc: '16', ssd: '256 ГБ', sc: '256', price: 119990, qty: 2 },
    { color: 'Silver',    cc: 'SL', ram: '24 ГБ', rc: '24', ssd: '1 ТБ',   sc: '1TB', price: 169990, qty: 1 },
  ]

  for (const v of macbookVariants) {
    await prisma.productVariant.create({
      data: {
        productId: macbook.id,
        sku: `MBAM4-${v.cc}-${v.rc}-${v.sc}`,
        price: v.price,
        quantity: v.qty,
        inStock: v.qty > 0,
        photos: [],
        attributes: { Цвет: v.color, Память: v.ram, Накопитель: v.ssd },
      },
    })
  }
  console.log(`MacBook Air M4: создан с ${macbookVariants.length} вариантами`)

  // ── 5. Категория «Аудио» ────────────────────────────────────────────────────
  const catAudio = await prisma.category.upsert({
    where: { name: 'Аудио' },
    update: {},
    create: { name: 'Аудио' },
  })

  // ── 6. AirPods Pro 2 ─────────────────────────────────────────────────────────
  const airpods = await prisma.product.create({
    data: {
      sku: 'APPRO2',
      name: 'AirPods Pro 2',
      brand: 'Apple',
      badge: 'ХИТ',
      description:
        'AirPods Pro 2 с чипом H2 — лучшее шумоподавление в наушниках Apple. Адаптивное шумоподавление, режим прозрачности, Персонализированный пространственный звук, до 6 часов музыки на одном заряде.',
      price: 24990,
      stock: 10,
      quantity: 10,
      isAvailable: true,
      categoryId: catAudio.id,
      photos: [],
      specs: {
        Чип: 'Apple H2',
        Шумоподавление: 'Адаптивное ANC',
        Звук: 'Персонализированный Spatial Audio',
        'Время работы': '6 часов (30 часов с кейсом)',
        Кейс: 'MagSafe, USB-C, ремешок для Apple Watch',
        Влагозащита: 'IP54',
        Подключение: 'Bluetooth 5.3',
      },
      attributes: {
        Цвет: ['White', 'Black'],
      },
    },
  })

  const airpodsVariants = [
    { color: 'White', code: 'WH', price: 24990, qty: 5 },
    { color: 'Black', code: 'BK', price: 24990, qty: 5 },
  ]

  for (const v of airpodsVariants) {
    await prisma.productVariant.create({
      data: {
        productId: airpods.id,
        sku: `APPRO2-${v.code}`,
        price: v.price,
        quantity: v.qty,
        inStock: v.qty > 0,
        photos: [],
        attributes: { Цвет: v.color },
      },
    })
  }
  console.log(`AirPods Pro 2: создан с ${airpodsVariants.length} вариантами`)

  // ── Итог ─────────────────────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    include: { category: true, variants: true },
    orderBy: { id: 'asc' },
  })
  console.log('\nГотово:')
  for (const p of products) {
    console.log(`  [${p.id}] ${p.name} — от ${p.price} ₽ (${p.variants.length} вар., кат: ${p.category?.name ?? '—'})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
