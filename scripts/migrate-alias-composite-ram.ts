/**
 * Разовая миграция композитных ключей PriceAlias под новый формат с RAM.
 *
 * Что чиним: ключ «model storage color» не различает конфигурации, которые
 * отличаются только объёмом RAM. У MacBook Air одна связка память+цвет живёт в
 * трёх конфигурациях, поэтому ключ «macbook air 13 m5 1tb midnight» одинаково
 * подходил вариантам 16/24/32 GB: привязка ложилась на тот, что привязали
 * последним, а следующий прайс с другой RAM молча уезжал не туда.
 *
 * Трогаем ТОЛЬКО двусмысленные ключи — те, у которых целевой вариант имеет ось
 * RAM, а в самом ключе RAM нет. Ключи планшетов, часов и телефонов остаются как
 * есть: у их вариантов оси RAM нет вовсе, ключ без RAM для них однозначен.
 *
 * Что делаем с каждым:
 *   • дописываем RAM целевого варианта → ключ становится точным и продолжает
 *     работать (следующий прайс с этой RAM его найдёт);
 *   • удаляем ТОЛЬКО если RAM восстановить не из чего (у варианта её нет) или
 *     новый ключ уже занят другой привязкой — с явной причиной в отчёте.
 *
 * Обратимо: снапшот до правки, `--restore --apply` возвращает прежние ключи.
 *
 *   npx ts-node scripts/migrate-alias-composite-ram.ts            — dry-run
 *   npx ts-node scripts/migrate-alias-composite-ram.ts --apply    — выполнить
 *   npx ts-node scripts/migrate-alias-composite-ram.ts --restore --apply
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { compositeAliasKey } from '../lib/price-alias'
import { logAdminAction } from '../lib/audit'

const APPLY = process.argv.includes('--apply')
const RESTORE = process.argv.includes('--restore')
const ACTOR = 'claude-alias-key-migration'
const SNAP = path.resolve(__dirname, '../reports/alias-composite-ram-migration.json')

/** Ключ прежнего формата — по нему узнаём композит среди алиасов. */
const oldComposite = (r: { model: string; storage: string | null; color: string | null }): string =>
  [r.model, r.storage, r.color].map(x => (x ?? '').trim()).filter(Boolean).join(' ').toLowerCase()

type Plan = {
  id: number
  alias: string
  variantId: number
  fullName: string
  ram: string | null
  newAlias: string | null
  action: 'rename' | 'delete' | 'skip'
  reason: string
}

async function restore(): Promise<void> {
  if (!fs.existsSync(SNAP)) { console.log('Снапшота нет — восстанавливать нечего.'); return }
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')) as { plans: Plan[] }
  const done = snap.plans.filter(p => p.action !== 'skip')
  console.log(`В снапшоте изменений: ${done.length}`)
  if (!APPLY) { console.log('DRY-RUN восстановления: запусти с --restore --apply'); return }
  let renamed = 0, recreated = 0
  for (const p of done) {
    if (p.action === 'rename') {
      const cur = await prisma.priceAlias.findUnique({ where: { id: p.id } })
      if (!cur) { await prisma.priceAlias.create({ data: { alias: p.alias, variantId: p.variantId } }); recreated++; continue }
      await prisma.priceAlias.update({ where: { id: p.id }, data: { alias: p.alias } })
      renamed++
    } else if (p.action === 'delete') {
      const exists = await prisma.priceAlias.findUnique({ where: { alias: p.alias } })
      if (!exists) { await prisma.priceAlias.create({ data: { alias: p.alias, variantId: p.variantId } }); recreated++ }
    }
  }
  await logAdminAction({
    adminTelegramId: ACTOR, action: 'price_alias_key_migration_restore', entity: 'PriceAlias', entityId: 'migration',
    before: { plans: done.length }, after: { renamed, recreated },
  })
  console.log(`Возвращено: переименовано обратно ${renamed}, воссоздано ${recreated}.`)
}

async function main(): Promise<void> {
  if (RESTORE) return restore()

  const aliases = await prisma.priceAlias.findMany({ where: { variantId: { not: null } }, orderBy: { id: 'asc' } })
  const rows = await prisma.supplierPrice.findMany({
    select: { id: true, model: true, storage: true, ram: true, color: true, rawMessage: true },
  })

  // Композит узнаём по строкам прайса: из самого ключа model/storage/color
  // обратно не разобрать, а из строки — ровно те поля, что его и составили.
  const rowsByOldKey = new Map<string, typeof rows>()
  const rawKeys = new Set(rows.map(r => r.rawMessage.trim().toLowerCase()))
  for (const r of rows) {
    const k = oldComposite(r)
    if (!k) continue
    const arr = rowsByOldKey.get(k) ?? []
    arr.push(r)
    rowsByOldKey.set(k, arr)
  }

  const plans: Plan[] = []
  for (const a of aliases) {
    if (rawKeys.has(a.alias)) continue                 // точный ключ строки — не композит
    const src = rowsByOldKey.get(a.alias)
    if (!src) continue                                  // не композит прежнего формата

    const v = await prisma.productVariant.findUnique({
      where: { id: a.variantId! },
      select: { attributes: true },
    })
    const attrs = (v?.attributes ?? {}) as Record<string, unknown>
    const ram = typeof attrs.RAM === 'string' ? attrs.RAM : null
    const fullName = typeof attrs.fullName === 'string' ? attrs.fullName : '—'

    // Оси RAM нет → ключ и так однозначен, не трогаем (планшеты, часы, телефоны)
    if (!ram) continue

    const base = src[0]!
    const newAlias = compositeAliasKey({ model: base.model, storage: base.storage, ram, color: base.color })
    const common = { id: a.id, alias: a.alias, variantId: a.variantId!, fullName, ram }

    if (!newAlias) {
      plans.push({ ...common, newAlias: null, action: 'delete', reason: 'новый ключ не построить' })
      continue
    }
    const taken = await prisma.priceAlias.findUnique({ where: { alias: newAlias } })
    if (taken && taken.id !== a.id) {
      plans.push({
        ...common, newAlias,
        action: taken.variantId === a.variantId ? 'delete' : 'skip',
        reason: taken.variantId === a.variantId
          ? `точный ключ уже есть (алиас ${taken.id}, тот же вариант) — старый двусмысленный убираем`
          : `КОНФЛИКТ: ключ занят алиасом ${taken.id} → v${taken.variantId}; разобрать руками`,
      })
      continue
    }
    // Расхождение RAM строки и варианта — не блокер (истина у варианта), но в отчёт
    const rowRams = [...new Set(src.map(r => r.ram).filter(Boolean))] as string[]
    const mismatch = rowRams.length && !rowRams.includes(ram) ? ` (в строках RAM: ${rowRams.join(', ')})` : ''
    plans.push({ ...common, newAlias, action: 'rename', reason: 'RAM дописана из привязанного варианта' + mismatch })
  }

  const renames = plans.filter(p => p.action === 'rename')
  const deletes = plans.filter(p => p.action === 'delete')
  const skips = plans.filter(p => p.action === 'skip')

  console.log(`\nДвусмысленных композитных ключей: ${plans.length}`)
  console.log(`  дописать RAM: ${renames.length}`)
  console.log(`  удалить: ${deletes.length}`)
  console.log(`  ОСТАВИТЬ КАК ЕСТЬ (конфликт, нужен человек): ${skips.length}`)
  for (const p of plans) {
    const arrow = p.action === 'rename' ? `→ «${p.newAlias}»` : p.action === 'delete' ? '→ УДАЛИТЬ' : '→ пропуск'
    console.log(`  ${p.action.padEnd(6)} ${p.id} «${p.alias}» ${arrow}\n           вариант v${p.variantId} «${p.fullName}» · ${p.reason}`)
  }

  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify({ takenAt: new Date().toISOString(), plans }, null, 2))
  console.log(`\nСнапшот: ${SNAP}`)

  if (!APPLY) { console.log('\nDRY-RUN: ничего не изменено.'); return }

  for (const p of renames) await prisma.priceAlias.update({ where: { id: p.id }, data: { alias: p.newAlias! } })
  for (const p of deletes) await prisma.priceAlias.delete({ where: { id: p.id } })
  await logAdminAction({
    adminTelegramId: ACTOR, action: 'price_alias_key_migration', entity: 'PriceAlias', entityId: 'migration',
    before: { keys: plans.map(p => ({ id: p.id, alias: p.alias, variantId: p.variantId })) },
    after: { renamed: renames.length, deleted: deletes.length, skipped: skips.length, snapshot: path.basename(SNAP) },
  })
  console.log(`\nПереименовано: ${renames.length}, удалено: ${deletes.length}, пропущено: ${skips.length}.`)
  console.log('Откат: npx ts-node scripts/migrate-alias-composite-ram.ts --restore --apply')
}

main().finally(() => prisma.$disconnect())
