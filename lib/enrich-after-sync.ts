/**
 * lib/enrich-after-sync.ts
 *
 * Автообогащение НОВЫХ товаров после успешного синка с таблицей.
 *
 * Три вещи здесь важнее удобства:
 *
 * 1. Синк не должен ни ждать обогащения, ни падать из-за него. Хук зовётся
 *    из sheets-sync через `void` уже после того, как счётчики посчитаны и
 *    результат готов; любая ошибка гасится здесь и наружу не всплывает.
 * 2. Расход виден не сразу, а в счёте. Поэтому тумблер (по умолчанию ВЫКЛ),
 *    потолок на прогон и только НОВЫЕ товары с пустым описанием и живыми
 *    предложениями: смена «Категории» в листе плодит товары-призраки пачками,
 *    и без этих оград один прогон синка мог бы уйти в десятки платных
 *    запросов по карточкам, которых покупатель не видит.
 * 3. Прогон один на процесс — тот же, что у ручного массового обогащения.
 *    Если владелец уже запустил обогащение руками, авто отступает.
 */
import { getApiKeyValue, setApiKeyValue } from './api-key-store'
import { startBatchEnrich } from './enrich-job'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'
import { prisma } from './prisma'
import log from './logger'

/** Ключ настройки в ApiKey — рядом с setting_marquee и setting_maintenance. */
const SETTING_KEY = 'setting_enrich_after_sync'

/**
 * Потолок на один прогон после синка. Обычный синк создаёт единицы товаров,
 * но пересортировка листа способна создать сотню — этот предел держит цену
 * одного прогона в пределах десятка рублей. Остаток добирается вручную.
 */
export const ENRICH_AFTER_SYNC_MAX = 20

/** Выключено по умолчанию: включение стоит денег, это решение владельца. */
export async function isEnrichAfterSyncEnabled(): Promise<boolean> {
  try {
    return (await getApiKeyValue(SETTING_KEY)) === '1'
  } catch {
    return false
  }
}

export async function setEnrichAfterSyncEnabled(actor: string, enabled: boolean): Promise<void> {
  await setApiKeyValue(SETTING_KEY, enabled ? '1' : '0')
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Setting',
    entityId: 'enrich_after_sync', after: { enabled },
  })
  void logSecurityEvent('enrich_after_sync_toggled', { enabled, maxItems: ENRICH_AFTER_SYNC_MAX }, actor)
}

/** Почему прогон не состоялся — уходит в лог, чтобы «почему ничего не было» имело ответ. */
export type SkipReason =
  | 'off'          // тумблер выключен
  | 'no_new'       // синк не создал ни одного товара
  | 'sync_aborted' // прогон синка прерван вручную/таймаутом
  | 'nothing'      // среди новых нет подходящих (пустое описание + есть предложения)
  | 'busy'         // обогащение уже идёт (ручное или прошлое авто)

export interface AfterSyncOutcome {
  started: boolean
  skipped?: SkipReason
  picked?: number
}

/**
 * Решает, запускать ли обогащение после синка, и запускает его в фоне.
 * НИКОГДА не бросает: вызывается из синка, и его падение не должно
 * превращать успешный прогон в ошибочный.
 */
export async function enrichAfterSync(
  createdProductIds: number[],
  sync: { aborted: boolean; errors: string[] },
  deps?: {
    isEnabled?: () => Promise<boolean>
    start?: (ids: number[]) => { started: boolean }
  },
): Promise<AfterSyncOutcome> {
  try {
    if (!createdProductIds.length) return { started: false, skipped: 'no_new' }

    // Прерванный прогон не повод тратить деньги: владелец нажал «стоп», а не
    // «продолжай в фоне». А вот предупреждения в errors прогон НЕ блокируют:
    // там живут косметические заметки вроде «SIM не определён» и «гашение
    // пропущено», и по ним автообогащение не включилось бы никогда.
    if (sync.aborted) {
      log.info('Enrich after sync skipped, sync aborted', { created: createdProductIds.length })
      return { started: false, skipped: 'sync_aborted' }
    }
    if (sync.errors.length) {
      log.info('Enrich after sync proceeds despite sync warnings', { warnings: sync.errors.length })
    }

    const enabled = await (deps?.isEnabled ?? isEnrichAfterSyncEnabled)()
    if (!enabled) return { started: false, skipped: 'off' }

    // Из новых берём только те, где описание пустое и есть предложения.
    const candidates = await prisma.product.findMany({
      where: {
        id: { in: createdProductIds },
        variants: { some: {} },
        OR: [{ description: null }, { description: '' }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: ENRICH_AFTER_SYNC_MAX,
    })
    if (!candidates.length) return { started: false, skipped: 'nothing' }

    const ids = candidates.map(c => c.id)
    // Тот же единственный прогон, что и у ручного массового обогащения:
    // ручной запуск владельца имеет приоритет, авто просто отступит.
    const start = deps?.start ?? ((picked: number[]) => startBatchEnrich('system:after_sync', {
      productIds: picked,
      maxItems: ENRICH_AFTER_SYNC_MAX,
      source: 'after_sync',
    }))

    const { started } = start(ids)
    if (!started) {
      log.info('Enrich after sync skipped, batch already running', { picked: ids.length })
      return { started: false, skipped: 'busy', picked: ids.length }
    }

    log.info('Enrich after sync started', { picked: ids.length, created: createdProductIds.length })
    return { started: true, picked: ids.length }
  } catch (e) {
    // Синк уже закончился успешно — его результат от нашей ошибки не меняется.
    log.error('Enrich after sync failed', { error: e instanceof Error ? e.message : String(e) })
    return { started: false }
  }
}
