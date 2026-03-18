import { prisma } from '../lib/prisma'

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: seed.ts must not run in production — it deletes all data!')
  process.exit(1)
}

async function main() {
  // ── Дефолтные сегменты ────────────────────────────────────────────────────
  const defaultSegments = [
    { name: 'Лид', color: '🔵', isDefault: true },
    { name: 'Квал', color: '🟡', isDefault: false },
    { name: 'Клиент', color: '🟢', isDefault: false },
  ]
  for (const seg of defaultSegments) {
    await prisma.segment.upsert({
      where: { name: seg.name },
      update: {},
      create: seg,
    })
  }
  console.log('Сегменты: Лид, Квал, Клиент созданы (или уже существуют)')

  // ── Товары ────────────────────────────────────────────────────────────────
  // Очищаем товары перед заполнением (idempotent)
  await prisma.product.deleteMany()

  const seedData = [
    {
      sku: 'IPH15PRO',
      name: 'iPhone 15 Pro',
      category: 'Телефоны',
      price: 89990,
      stock: 10,
      isAvailable: true,
      photoUrl:
        'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-1inch_GEO_EMEA?wid=400',
    },
    {
      sku: 'MBAM2',
      name: 'MacBook Air M2',
      category: 'Ноутбуки',
      price: 129990,
      stock: 5,
      isAvailable: true,
      photoUrl:
        'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=400',
    },
    {
      sku: 'AIRPODSPRO',
      name: 'AirPods Pro',
      category: 'Аудио',
      price: 24990,
      stock: 20,
      isAvailable: true,
      photoUrl:
        'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=400',
    },
  ]

  let count = 0
  for (const { category, ...rest } of seedData) {
    await prisma.product.create({
      data: {
        ...rest,
        quantity: rest.stock,
        category: { connectOrCreate: { where: { name: category }, create: { name: category } } },
      },
    })
    count++
  }

  console.log(`Seed выполнен: добавлено ${count} товаров`)

  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { id: 'asc' },
  })
  for (const p of products) {
    console.log(`  [${p.id}] ${p.name} — ${p.price} ₽ (${p.category?.name ?? '—'})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
