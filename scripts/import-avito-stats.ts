import 'dotenv/config'
import * as fs from 'fs'
import { prisma } from '../lib/prisma'
import { importAvitoStats, importAvitoSales } from '../lib/avito-import'

async function main() {
  const args = process.argv.slice(2)
  const files = args.filter(a => a.endsWith('.xlsx'))

  if (args.includes('--stats') || args.includes('--all')) {
    const file = files.find(f => /татистик/i.test(f)) || files[0]
    if (!file) { console.error('Specify xlsx file path'); process.exit(1) }
    const buffer = fs.readFileSync(file)
    const count = await importAvitoStats(buffer)
    console.log(`Imported ${count} Avito stats from ${file}`)
  }

  if (args.includes('--sales') || args.includes('--all')) {
    const file = files.find(f => /асход|продаж/i.test(f)) || files[0]
    if (!file) { console.error('Specify xlsx file path'); process.exit(1) }
    const buffer = fs.readFileSync(file)
    const count = await importAvitoSales(buffer)
    console.log(`Imported ${count} sales from ${file}`)
  }

  if (!args.includes('--stats') && !args.includes('--sales') && !args.includes('--all')) {
    console.log('Usage:')
    console.log('  npx ts-node scripts/import-avito-stats.ts --stats <file.xlsx>')
    console.log('  npx ts-node scripts/import-avito-stats.ts --sales <file.xlsx>')
    console.log('  npx ts-node scripts/import-avito-stats.ts --all <stats.xlsx> <sales.xlsx>')
  }

  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
