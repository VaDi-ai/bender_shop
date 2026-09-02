/**
 * lib/enrich-job.ts
 *
 * Состояние фонового обогащения карточки. Запрос админки никогда не ждёт
 * OpenRouter: ручка отвечает 202 и кладёт сюда прогон, фронт поллит статус.
 *
 * Состояние живёт в памяти процесса — бот и админ-API работают в одном
 * (package.json: start = node dist/bot/index.js, api/server.ts монтирует
 * /admin/api в нём же), поэтому запуск и опрос всегда видят одну и ту же
 * карту. Плата за это — редеплой Railway забывает незавершённые прогоны:
 * для одной карточки (≈10 с) приемлемо, фронт покажет «idle» и даст повторить.
 */
import { enrichProductCard, ENRICH_FAIL_MESSAGE, type EnrichResult } from './enrich'
import { logAdminAction } from './audit'
import log from './logger'

export type CardJobStatus = 'running' | 'done' | 'failed'

export interface CardJob {
  productId: number
  status: CardJobStatus
  startedBy: string
  startedAt: number
  finishedAt?: number
  filled?: { description: boolean; specs: number }
  reason?: string
  message?: string
}

/** Завершённый прогон живёт ещё 10 минут — чтобы фронт успел его прочитать. */
const KEEP_FINISHED_MS = 10 * 60 * 1000

const jobs = new Map<number, CardJob>()

function sweep(): void {
  const cutoff = Date.now() - KEEP_FINISHED_MS
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && (job.finishedAt ?? 0) < cutoff) jobs.delete(id)
  }
}

export function getCardJob(productId: number): CardJob | null {
  sweep()
  return jobs.get(productId) ?? null
}

/** Только для тестов: карта — модульный синглтон, между кейсами её надо чистить. */
export function resetCardJobs(): void {
  jobs.clear()
}

/**
 * Запускает обогащение карточки в фоне. Возвращает `started: false`, если по
 * этому товару прогон уже идёт: два параллельных запроса — это две оплаты
 * одного и того же ответа.
 */
export function startCardEnrich(
  productId: number,
  actor: string,
  opts?: { force?: boolean; run?: (id: number, force: boolean) => Promise<EnrichResult> },
): { started: boolean; job: CardJob } {
  sweep()
  const existing = jobs.get(productId)
  if (existing && existing.status === 'running') return { started: false, job: existing }

  const force = opts?.force ?? true
  const job: CardJob = { productId, status: 'running', startedBy: actor, startedAt: Date.now() }
  jobs.set(productId, job)

  const run = opts?.run ?? ((id: number, f: boolean) => enrichProductCard(id, f))

  // Намеренно не ждём: ручка уже ответила 202. Любое исключение гасим здесь —
  // unhandled rejection в этом процессе уронил бы и бота.
  void (async () => {
    try {
      const r = await run(productId, force)
      job.filled = r.filled
      job.reason = r.reason
      job.message = r.message
      job.status = r.ok ? 'done' : 'failed'
      if (r.ok) {
        void logAdminAction({
          adminTelegramId: actor,
          action: 'enrich',
          entity: 'Product',
          entityId: productId,
          after: { description: r.filled.description, specs: r.filled.specs, force },
        })
        const { touchStorefrontCache } = await import('./storefront-admin')
        await touchStorefrontCache('product_enrich')
      }
    } catch (e) {
      // Сюда попадают только неожиданные падения: сам enrichProductCard
      // отказы уже переводит в reason.
      job.status = 'failed'
      job.reason = 'network'
      job.message = ENRICH_FAIL_MESSAGE.network
      log.error('Enrich card job crashed', {
        productId,
        error: e instanceof Error ? e.message : String(e),
      })
    } finally {
      job.finishedAt = Date.now()
    }
  })()

  return { started: true, job }
}
