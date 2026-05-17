/**
 * dist/bot/index.js: сид регионов — только сырой SQL в "ShopRegion".
 * Нельзя prisma*.region.upsert: с @prisma/adapter-pg запрос уезжает в public."Region".
 */
const fs = require('fs')
const path = require('path')

const p = path.join(__dirname, '..', 'dist', 'bot', 'index.js')
if (!fs.existsSync(p)) {
  console.error('verify-dist: missing', p)
  process.exit(1)
}
const s = fs.readFileSync(p, 'utf8')

if (/\bprisma\w*\.region\.upsert\s*\(/.test(s)) {
  console.error('verify-dist: do not use prisma.region.upsert with adapter-pg; use raw SQL ShopRegion')
  console.error('verify-dist: if dist/ was committed to git, remove it (git rm -r --cached dist); Nixpacks COPY would overwrite a fresh tsc build.')
  console.error('verify-dist: on Railway, unmount Volume from /app or /app/dist; photos: /data/photos + PHOTOS_DIR')
  process.exit(1)
}
if (!/ShopRegion/.test(s)) {
  console.error('verify-dist: dist must contain ShopRegion (raw SQL seed)')
  console.error('verify-dist: if dist/ was committed to git, remove it (git rm -r --cached dist); Nixpacks COPY would overwrite a fresh tsc build.')
  console.error('verify-dist: on Railway, unmount Volume from /app or /app/dist; photos: /data/photos + PHOTOS_DIR')
  process.exit(1)
}

console.log('verify-dist: ok')
