/**
 * lib/jobs-switches.ts
 *
 * Рубильники фоновых задач и уведомлений. Каждый гасит ровно одну задачу —
 * guard-clause'ом в её начале (или на её отправке); код задачи не удаляется.
 *
 *   avitoChats     — поллинг чатов Авито раз в 2 минуты (bot/scheduler.ts)
 *   avitoCommands  — /avito map и /avito sync в боте
 *   morningSummary — «📋 Утренняя сводка цен» админам в 11:00
 *   clientAuto     — клиентские авто-отправки: «Доброе утро, цены готовы» и
 *                    задачи планировщика remind_client / promo_notify
 *   priceAlerts    — админские уведомления о ценах: применение вне коридора,
 *                    новый прайс от поставщика, ежечасный синк, устаревшие цены
 *
 * Курс доллара (10:00 и алерт о скачке) здесь НЕ живёт намеренно — решение
 * владельца от 2026-09-22: он шлётся всегда.
 *
 * Настройка — один JSON-ключ в ApiKey, как setting_promo_vpn. Разбор
 * fail-open: ключа нет, флага нет, значение битое или не читается → флаг ВКЛ.
 * Так мерж невидим (всё работает как до него), а выключить задачу можно только
 * явным `false`, записанным владельцем.
 */
import { getApiKeyValue, setApiKeyValue } from './api-key-store'
import { logAdminAction } from './audit'
import log from './logger'

export const JOBS_SETTING = 'setting_jobs'

export const JOB_NAMES = ['avitoChats', 'avitoCommands', 'morningSummary', 'clientAuto', 'priceAlerts'] as const
export type JobName = typeof JOB_NAMES[number]
export type JobsConfig = Record<JobName, boolean>

export const DEFAULT_JOBS: JobsConfig = {
  avitoChats: true, avitoCommands: true, morningSummary: true, clientAuto: true, priceAlerts: true,
}

/** Ответ на выключенные /avito map и /avito sync. */
export const AVITO_OFF_REPLY = 'Авито временно выключен'

/** Подкоманды /avito, которые ходят в API Авито и гасятся тумблером avitoCommands. */
const AVITO_GATED_SUBS = new Set(['map', 'sync'])

/**
 * Разбор сохранённого значения. Выключает флаг ТОЛЬКО явный `false`;
 * всё остальное (null, мусор, чужой тип, битый JSON) — ВКЛ.
 */
export function parseJobsConfig(raw: string | null): JobsConfig {
  if (raw === null || raw === '') return { ...DEFAULT_JOBS }
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    log.warn('setting_jobs: битый JSON — все задачи считаются включёнными')
    return { ...DEFAULT_JOBS }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ...DEFAULT_JOBS }
  const src = obj as Record<string, unknown>
  const out = { ...DEFAULT_JOBS }
  for (const name of JOB_NAMES) out[name] = src[name] !== false
  return out
}

export async function loadJobs(): Promise<JobsConfig> {
  try {
    return parseJobsConfig(await getApiKeyValue(JOBS_SETTING))
  } catch (e) {
    log.warn('setting_jobs: не прочиталось — все задачи считаются включёнными', { error: e instanceof Error ? e.message : String(e) })
    return { ...DEFAULT_JOBS }
  }
}

/** Читается на каждом запуске задачи, без кэша: переключение действует со следующего тика. */
export async function isJobEnabled(name: JobName): Promise<boolean> {
  return (await loadJobs())[name]
}

/** true — подкоманду /avito выполнять нельзя, нужно ответить AVITO_OFF_REPLY. */
export async function isAvitoCommandBlocked(sub: string | undefined): Promise<boolean> {
  if (!sub || !AVITO_GATED_SUBS.has(sub)) return false
  return !(await isJobEnabled('avitoCommands'))
}

export type SetJobsResult =
  | { ok: true; status: 200; data: JobsConfig }
  | { ok: false; status: 422; error: string }

/**
 * Запись из админки (роут закрыт ownerOnly). Флага нет в теле → переносим
 * текущее значение: сохранение одного тумблера не трогает соседей.
 * Не-булево значение — 422, чтобы опечатка не превратилась в молчаливое ВКЛ.
 */
export async function setJobs(actor: string, body: Record<string, unknown>): Promise<SetJobsResult> {
  const before = await loadJobs()
  const after = { ...before }
  for (const name of JOB_NAMES) {
    const v = body[name]
    if (v === undefined) continue
    if (typeof v !== 'boolean') return { ok: false, status: 422, error: `Поле ${name} — только true или false` }
    after[name] = v
  }
  await setApiKeyValue(JOBS_SETTING, JSON.stringify(after))
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Setting', entityId: 'jobs', before, after,
  })
  log.info('setting_jobs updated', { actor, ...after })
  return { ok: true, status: 200, data: after }
}
