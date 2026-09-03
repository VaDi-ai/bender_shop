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
import {
  enrichProductCard,
  enrichAllProducts,
  ENRICH_FAIL_MESSAGE,
  type EnrichResult,
  type EnrichBatchOptions,
  type EnrichBatchResult,
  type EnrichScope,
} from './enrich'
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

// ─── Массовый прогон: один на процесс ────────────────────────────────────────
//
// Массовое обогащение — это прямые деньги, поэтому прогон ровно один: пока он
// идёт, второй запуск получает 409, а не удваивает счёт. Состояние тоже
// в памяти (см. комментарий вверху файла); прогресс владелец видит опросом.

export type BatchJobStatus = 'running' | 'done' | 'aborted' | 'failed'

export interface BatchJob {
  status: BatchJobStatus
  scope: EnrichScope
  /** Кто затеял прогон: владелец руками или синк после создания товаров. */
  source: 'manual' | 'after_sync'
  startedBy: string
  startedAt: number
  finishedAt?: number
  /** Сколько взяли в работу (после потолка maxItems). */
  total: number
  /** Сколько всего подходит под условие — чтобы владелец видел остаток. */
  candidates: number
  done: number
  enriched: number
  failed: number
  skipped: number
  /** Название товара, который обрабатывается прямо сейчас. */
  current?: string
  lastError?: string
}

let batchJob: BatchJob | null = null
let batchAbort = false

export function getBatchJob(): BatchJob | null {
  return batchJob
}

/** Просит текущий прогон остановиться. Товар «в полёте» доработает до конца. */
export function abortBatchEnrich(): boolean {
  if (!batchJob || batchJob.status !== 'running') return false
  batchAbort = true
  log.info('Enrich batch abort requested')
  return true
}

/** Только для тестов. */
export function resetBatchJob(): void {
  batchJob = null
  batchAbort = false
}

/**
 * Запускает массовое обогащение в фоне. `started: false` — прогон уже идёт.
 * Перезаписи здесь не бывает: force не принимаем вовсе, заполняются только
 * пустые поля (перезапись — только кнопкой на конкретной карточке).
 */
export function startBatchEnrich(
  actor: string,
  opts?: {
    scope?: EnrichScope
    /** Ограничить прогон конкретными товарами (авто после синка). */
    productIds?: number[]
    source?: 'manual' | 'after_sync'
    maxItems?: number
    onlyWithVariants?: boolean
    pauseMs?: number
    run?: (o: EnrichBatchOptions) => Promise<EnrichBatchResult>
  },
): { started: boolean; job: BatchJob | null } {
  if (batchJob && batchJob.status === 'running') return { started: false, job: batchJob }

  const scope = opts?.scope ?? 'empty_description'
  batchAbort = false
  const job: BatchJob = {
    status: 'running',
    scope,
    source: opts?.source ?? 'manual',
    startedBy: actor,
    startedAt: Date.now(),
    total: 0,
    candidates: 0,
    done: 0,
    enriched: 0,
    failed: 0,
    skipped: 0,
  }
  batchJob = job

  const run = opts?.run ?? ((o: EnrichBatchOptions) => enrichAllProducts(undefined, o))

  void (async () => {
    try {
      const r = await run({
        scope,
        ...(opts?.productIds ? { productIds: opts.productIds } : {}),
        force: false,                                     // массовое НИКОГДА не перезаписывает
        onlyWithVariants: opts?.onlyWithVariants ?? true,
        maxItems: opts?.maxItems ?? 50,
        pauseMs: opts?.pauseMs ?? 2000,
        shouldAbort: () => batchAbort,
        onProgress: p => {
          job.done = p.done
          job.total = p.total
          job.current = p.name
        },
      })
      job.total = r.total
      job.candidates = r.candidates
      job.done = r.total
      job.enriched = r.enriched
      job.failed = r.failed
      job.skipped = r.skipped
      job.lastError = r.lastError
      job.status = r.aborted ? 'aborted' : 'done'
      job.current = undefined
      void logAdminAction({
        adminTelegramId: actor,
        action: 'enrich_batch',
        entity: 'Product',
        after: { scope, source: job.source, total: r.total, enriched: r.enriched, failed: r.failed, skipped: r.skipped, aborted: r.aborted },
      })
      if (r.enriched > 0) {
        const { touchStorefrontCache } = await import('./storefront-admin')
        await touchStorefrontCache('product_enrich_batch')
      }
    } catch (e) {
      job.status = 'failed'
      job.lastError = e instanceof Error ? e.message : String(e)
      job.current = undefined
      log.error('Enrich batch job crashed', { error: job.lastError })
    } finally {
      job.finishedAt = Date.now()
      batchAbort = false
    }
  })()

  return { started: true, job }
}
