import { prisma } from '../lib/prisma'

async function main() {
  // Очищаем товары перед заполнением (idempotent)
  await prisma.product.deleteMany()

  const { count } = await prisma.product.createMany({
    data: [
      {
        name: 'iPhone 15 Pro',
        category: 'Телефоны',
        price: 89990,
        stock: 10,
        isAvailable: true,
        photoUrl:
          'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-1inch_GEO_EMEA?wid=400',
      },
      {
        name: 'MacBook Air M2',
        category: 'Ноутбуки',
        price: 129990,
        stock: 5,
        isAvailable: true,
        photoUrl:
          'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=400',
      },
      {
        name: 'AirPods Pro',
        category: 'Аудио',
        price: 24990,
        stock: 20,
        isAvailable: true,
        photoUrl:
          'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=400',
      },
    ],
  })

  console.log(`Seed выполнен: добавлено ${count} товаров`)

  const products = await prisma.product.findMany({ orderBy: { id: 'asc' } })
  for (const p of products) {
    console.log(`  [${p.id}] ${p.name} — ${p.price} ₽ (${p.category})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
