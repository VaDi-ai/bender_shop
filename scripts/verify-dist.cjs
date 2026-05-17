/**
 * dist/bot/index.js должен вызывать prisma.region (модель Region, @@map("ShopRegion")).
 * Запрет: prisma.shopRegion — иначе рассинхрон с схемой.
 * Если volume перетирает /app/dist старым билдом — проверка на этапе build не спасёт; см. railway.toml.
 */
const fs = require('fs')
const path = require('path')

const p = path.join(__dirname, '..', 'dist', 'bot', 'index.js')
if (!fs.existsSync(p)) {
  console.error('verify-dist: missing', p)
  process.exit(1)
}
const s = fs.readFileSync(p, 'utf8')

if (/\bprisma\w*\.shopRegion\./.test(s)) {
  console.error('verify-dist: dist must not use prisma.shopRegion (use prisma.region + @@map)')
  process.exit(1)
}
if (!/\bprisma\w*\.region\./.test(s)) {
  console.error('verify-dist: dist must reference prisma.region (Region seed)')
  process.exit(1)
}

console.log('verify-dist: ok')
