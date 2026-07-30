/**
 * Заведение нового товара из строки очереди «не узнал» (owner-only).
 *
 * ОГРАДЫ:
 * - товар создаётся ВСЕГДА СКРЫТЫМ (isAvailable=false, вариант inStock=false):
 *   кривой разбор не должен доехать до покупателя; владелец включает руками
 *   после проверки;
 * - цену на витрину НЕ пишем (price=0, costPrice пуст) — цена придёт обычным
 *   путём preview→apply, коридор при базе 0 сам потребует владельца;
 * - страна — только канон словаря AttrValueAlias('Страна'); нераспознанную
 *   не выдумываем (атрибут не ставится);
 * - SIM: явное значение строки канонизируется, отсутствующее до-выводится
 *   существующим resolveSimType; правила нет → SIM не ставим.
 *
 * После создания строка привязывается существующим linkSupplierPriceRow —
 * он же учит PriceAlias (rawLine + композит «model storage color») и
 * до-матчивает одинаковые строки в других preview-батчах.
 */
import { prisma } from './prisma'
import { logAdminAction } from './audit'
import { loadSimRules, loadAttrAliases, resolveSimType, AttrAliasData } from './sim-rules'
import { linkSupplierPriceRow } from './price-alias'

/**
 * Бренд по названию модели (перенесено из bot/admin/pricing.ts).
 * Дополнено: продукты Apple не содержат слова «apple» в названии («iPhone 17
 * Pro»), из-за чего бренд оставался пустым — а каталог и SIM-правила живут
 * на бренде.
 */
export function detectBrandFromName(name: string): string {
  const lower = name.toLowerCase()
  if (/\b(iphone|ipad|macbook|airpods|imac|mac\s*(mini|pro|studio)|apple)\b/.test(lower)) return 'Apple'
  const brands = ['Samsung', 'Xiaomi', 'Huawei', 'Honor', 'Google', 'Sony', 'Lenovo', 'ASUS', 'OnePlus', 'Oppo', 'Vivo', 'Realme', 'Nothing', 'Motorola', 'Nokia', 'LG', 'Garmin', 'JBL', 'Marshall', 'Dyson', 'DJI']
  return brands.find(b => lower.includes(b.toLowerCase())) || ''
}

/** Категория по названию модели (перенесено из bot/admin/pricing.ts без изменений). */
export function detectCategoryFromName(name: string): string | null {
  const lower = name.toLowerCase()
  if (/iphone|galaxy\s*s|galaxy\s*a|pixel|redmi|poco|oneplus/i.test(lower)) return 'Телефоны'
  if (/ipad|tab\s|matepad|galaxy\s*tab/i.test(lower)) return 'Планшеты'
  if (/macbook|laptop|thinkpad|zenbook|vivobook/i.test(lower)) return 'Ноутбуки'
  if (/watch|часы|band|fenix|venu/i.test(lower)) return 'Часы'
  if (/airpods|buds|headphone|наушник|pods|jbl|marshall/i.test(lower)) return 'Аудио'
  if (/playstation|ps5|xbox|switch|nintendo/i.test(lower)) return 'Игры приставки'
  if (/imac|mac\s*mini|mac\s*pro|mac\s*studio/i.test(lower)) return 'Настольные компьютеры'
  return null
}

function canonCountry(raw: string | null | undefined, aliases: AttrAliasData[]): string | null {
  if (!raw?.trim()) return null
  const r = raw.trim().toLowerCase()
  return aliases.find(a => a.attrKey === 'Страна' && a.rawNorm === r)?.canonical ?? null
}

export interface CreateFromRowResult {
  ok: boolean
  status: number
  error?: string
  productId?: number
  variantId?: number
  productName?: string
  attrs?: Record<string, string>
  aliases?: string[]
  rematched?: number
}

export async function createProductFromPriceRow(opts: {
  supplierPriceId: number
  actor: { telegramId: string }
}): Promise<CreateFromRowResult> {
  const row = await prisma.supplierPrice.findUnique({ where: { id: opts.supplierPriceId } })
  if (!row) return { ok: false, status: 404, error: 'Строка прайса не найдена' }
  if (row.variantId !== null) return { ok: false, status: 409, error: 'Строка уже привязана к варианту' }

  const model = row.model.trim()
  if (!model) return { ok: false, status: 422, error: 'В строке нет названия модели' }

  const aliases = await loadAttrAliases()
  const attrs: Record<string, string> = {}
  if (row.storage?.trim()) attrs['Память'] = row.storage.trim()
  if (row.color?.trim()) attrs['Цвет'] = row.color.trim()

  const country = canonCountry(row.country, aliases)
  if (country) attrs['Страна'] = country

  const brand = detectBrandFromName(model)
  const sim = resolveSimType(
    { explicit: row.simType, country, brand: brand || null, names: [model] },
    await loadSimRules(),
    aliases,
  )
  if (sim.simType) attrs['SIM'] = sim.simType

  const fullName = [model, attrs['Память'], attrs['Цвет']].filter(Boolean).join(' ')
    + (country ? ` (${country})` : '')

  const catName = detectCategoryFromName(model) || 'Другое'
  const category = await prisma.category.upsert({
    where: { name: catName },
    create: { name: catName },
    update: {},
  })

  const catNum = String(category.id).padStart(2, '0')
  const productSku = catNum + '-' + Date.now().toString(36).slice(-4) + '-' + Math.random().toString(36).slice(-3)
  const variantSku = productSku + '-' + Math.random().toString(36).slice(-3)

  const { product, variant } = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        sku: productSku,
        name: model,
        brand: brand || null,
        categoryId: category.id,
        price: 0,
        stock: 0,
        quantity: 0,
        isAvailable: false,
        attributes: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, [v]])),
        photos: [],
      },
    })
    const variant = await tx.productVariant.create({
      data: {
        productId: product.id,
        sku: variantSku,
        price: 0,
        quantity: 0,
        inStock: false,
        attributes: { ...attrs, fullName },
        photos: [],
      },
    })
    return { product, variant }
  })

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: 'create',
    entity: 'Product',
    entityId: product.id,
    after: {
      name: model, sku: productSku, variantId: variant.id, variantSku,
      categoryId: category.id, brand: brand || null, attrs,
      isAvailable: false, fromSupplierPriceId: row.id, rawLine: row.rawMessage,
    },
  })

  // Существующий путь обучения: PriceAlias по rawLine+композиту, пере-матч
  // одинаковых строк в preview-батчах, счётчики, свой audit-след.
  const link = await linkSupplierPriceRow({
    supplierPriceId: row.id,
    variantId: variant.id,
    actor: opts.actor,
  })

  return {
    ok: true, status: 201,
    productId: product.id, variantId: variant.id, productName: model,
    attrs, aliases: link.aliases, rematched: link.rematched,
  }
}
