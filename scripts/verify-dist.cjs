/**
 * Сборка должна содержать актуальный код (shopRegion, не legacy prisma.region).
 * Если Railway смонтировал volume поверх /app или /app/dist, в рантайме остаётся старый dist — этот шаг на билде падает, если исходники и dist расходятся.
 */
const fs = require('fs')
const path = require('path')

const p = path.join(__dirname, '..', 'dist', 'bot', 'index.js')
if (!fs.existsSync(p)) {
  console.error('verify-dist: missing', p)
  process.exit(1)
}
const s = fs.readFileSync(p, 'utf8')

if (/\bprisma\w*\.region\./.test(s)) {
  console.error('verify-dist: dist/bot/index.js still references prisma*.region (rebuild / check volume mount on /app)')
  process.exit(1)
}
if (!/\bshopRegion\b/.test(s)) {
  console.error('verify-dist: dist/bot/index.js must reference shopRegion')
  process.exit(1)
}

console.log('verify-dist: ok')
