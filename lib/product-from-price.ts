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

/**
 * Правки владельца с экрана «Проверьте товар» (шаг 3): чинят РАЗБОР перед
 * заведением. Пустая строка в правке = «атрибут не ставить». inStock — тумблер
 * «Остаток: Есть/Нет»; на скрытость товара не влияет (isAvailable всегда false).
 */
export interface CreateFromRowEdits {
  model?: string
  brand?: string
  storage?: string
  color?: string
  country?: string
  simType?: string
  inStock?: boolean
}

const EDIT_STRING_FIELDS = ['model', 'brand', 'storage', 'color', 'country', 'simType'] as const

/** Валидация правок: только разрешённые поля, строки ≤100 — чистая функция для юнитов. */
export function validateCreateEdits(raw: unknown): {
  errors: Array<{ field: string; message: string }>
  edits: CreateFromRowEdits
} {
  if (raw === undefined || raw === null) return { errors: [], edits: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: [{ field: 'body', message: 'Неверный формат правок' }], edits: {} }
  }
  const body = raw as Record<string, unknown>
  const errors: Array<{ field: string; message: string }> = []
  const edits: CreateFromRowEdits = {}
  for (const key of Object.keys(body)) {
    if (key === 'inStock') {
      if (typeof body.inStock !== 'boolean') errors.push({ field: 'inStock', message: 'Остаток — только Есть/Нет' })
      else edits.inStock = body.inStock
      continue
    }
    const f = EDIT_STRING_FIELDS.find(x => x === key)
    if (!f) { errors.push({ field: key, message: 'Поле не редактируется при заведении' }); continue }
    const v = body[key]
    if (typeof v !== 'string') { errors.push({ field: key, message: 'Ожидается строка' }); continue }
    if (v.length > 100) { errors.push({ field: key, message: 'Длиннее 100 символов' }); continue }
    edits[f] = v.trim()
  }
  return { errors, edits: errors.length ? {} : edits }
}

export async function createProductFromPriceRow(opts: {
  supplierPriceId: number
  actor: { telegramId: string }
  edits?: CreateFromRowEdits
}): Promise<CreateFromRowResult> {
  const row = await prisma.supplierPrice.findUnique({ where: { id: opts.supplierPriceId } })
  if (!row) return { ok: false, status: 404, error: 'Строка прайса не найдена' }
  if (row.variantId !== null) return { ok: false, status: 409, error: 'Строка уже привязана к варианту' }

  // Правка владельца перекрывает разбор; пустая строка = «не ставить»
  const e = opts.edits ?? {}
  const pick = (edited: string | undefined, parsed: string | null | undefined): string =>
    (edited !== undefined ? edited : parsed ?? '').trim()

  const model = pick(e.model, row.model)
  if (!model) return { ok: false, status: 422, error: 'В строке нет названия модели' }

  const aliases = await loadAttrAliases()
  const attrs: Record<string, string> = {}
  const storage = pick(e.storage, row.storage)
  if (storage) attrs['Память'] = storage
  const color = pick(e.color, row.color)
  if (color) attrs['Цвет'] = color

  // Страна — по-прежнему только канон словаря, в т.ч. для правок: не наугад
  const country = canonCountry(pick(e.country, row.country), aliases)
  if (country) attrs['Страна'] = country

  const brand = pick(e.brand, null) || detectBrandFromName(model)
  const sim = resolveSimType(
    { explicit: pick(e.simType, row.simType) || null, country, brand: brand || null, names: [model] },
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
        // Тумблер «Остаток»: Есть → inStock + 1 шт. Товар при этом остаётся
        // скрытым (isAvailable=false выше) — до покупателя не доходит.
        quantity: e.inStock === true ? 1 : 0,
        inStock: e.inStock === true,
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
