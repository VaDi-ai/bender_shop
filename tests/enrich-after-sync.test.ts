/**
 * Автообогащение новых товаров после синка.
 *
 * Главный инвариант: синк остаётся синком. Хук не ждёт обогащения, не роняет
 * прогон и не тратит деньги без явного включения владельцем. Отдельно держим
 * ограду от собственной чрезмерной осторожности: предупреждения синка
 * («SIM не определён», «гашение пропущено») прогон блокировать НЕ должны —
 * иначе автообогащение не включилось бы никогда.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { startBatchEnrichMock } = vi.hoisted(() => ({
  startBatchEnrichMock: vi.fn(() => ({ started: true, job: null })),
}))

vi.mock('../lib/prisma', () => ({
  prisma: { product: { findMany: vi.fn() } },
}))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/enrich-job', () => ({ startBatchEnrich: startBatchEnrichMock }))

import { prisma } from '../lib/prisma'
import { getApiKeyValue, setApiKeyValue } from '../lib/api-key-store'
import {
  enrichAfterSync,
  isEnrichAfterSyncEnabled,
  setEnrichAfterSyncEnabled,
  ENRICH_AFTER_SYNC_MAX,
} from '../lib/enrich-after-sync'

/* eslint-disable @typescript-eslint/no-explicit-any */
const findMany = prisma.product.findMany as any
const readSetting = getApiKeyValue as any
const writeSetting = setApiKeyValue as any

const CLEAN = { aborted: false, errors: [] as string[] }
const NEW_IDS = [101, 102, 103]

beforeEach(() => {
  ;[findMany, readSetting, writeSetting, startBatchEnrichMock].forEach(f => f.mockReset())
  startBatchEnrichMock.mockReturnValue({ started: true, job: null })
  findMany.mockResolvedValue([{ id: 101 }, { id: 102 }])
  readSetting.mockResolvedValue('1')
})

describe('тумблер', () => {
  it('по умолчанию выключен: настройки нет — значит нет', async () => {
    readSetting.mockResolvedValue(null)
    expect(await isEnrichAfterSyncEnabled()).toBe(false)
  })

  it('включённым считается только «1» — любое другое значение это выключено', async () => {
    readSetting.mockResolvedValue('1')
    expect(await isEnrichAfterSyncEnabled()).toBe(true)
    readSetting.mockResolvedValue('0')
    expect(await isEnrichAfterSyncEnabled()).toBe(false)
    readSetting.mockResolvedValue('true')
    expect(await isEnrichAfterSyncEnabled()).toBe(false)
  })

  it('недоступное хранилище — считаем выключенным, а не «наверное включено»', async () => {
    readSetting.mockRejectedValue(new Error('БД моргнула'))
    expect(await isEnrichAfterSyncEnabled()).toBe(false)
  })

  it('переключение пишет настройку', async () => {
    await setEnrichAfterSyncEnabled('900', true)
    expect(writeSetting).toHaveBeenCalledWith('setting_enrich_after_sync', '1')
    await setEnrichAfterSyncEnabled('900', false)
    expect(writeSetting).toHaveBeenLastCalledWith('setting_enrich_after_sync', '0')
  })
})

describe('когда прогон не запускается', () => {
  it('тумблер выключен — ни запроса кандидатов, ни прогона', async () => {
    readSetting.mockResolvedValue('0')

    const r = await enrichAfterSync(NEW_IDS, CLEAN)

    expect(r).toEqual({ started: false, skipped: 'off' })
    expect(findMany).not.toHaveBeenCalled()
    expect(startBatchEnrichMock).not.toHaveBeenCalled()
  })

  it('синк не создал ничего нового — выходим до чтения настройки', async () => {
    const r = await enrichAfterSync([], CLEAN)

    expect(r).toEqual({ started: false, skipped: 'no_new' })
    expect(readSetting).not.toHaveBeenCalled()
  })

  it('прогон синка прерван — денег не тратим', async () => {
    const r = await enrichAfterSync(NEW_IDS, { aborted: true, errors: [] })

    expect(r).toEqual({ started: false, skipped: 'sync_aborted' })
    expect(startBatchEnrichMock).not.toHaveBeenCalled()
  })

  it('среди новых нет подходящих — «nothing», прогон не заводим', async () => {
    findMany.mockResolvedValue([])

    const r = await enrichAfterSync(NEW_IDS, CLEAN)

    expect(r).toEqual({ started: false, skipped: 'nothing' })
    expect(startBatchEnrichMock).not.toHaveBeenCalled()
  })

  it('обогащение уже идёт (владелец запустил руками) — авто отступает', async () => {
    startBatchEnrichMock.mockReturnValue({ started: false, job: null })

    const r = await enrichAfterSync(NEW_IDS, CLEAN)

    expect(r).toMatchObject({ started: false, skipped: 'busy' })
  })
})

describe('предупреждения синка прогон не блокируют', () => {
  it('«SIM не определён» и «гашение пропущено» — это заметки, а не отказ', async () => {
    const r = await enrichAfterSync(NEW_IDS, {
      aborted: false,
      errors: ['SIM не определён: Гонконг (3)', 'Гашение вариантов пропущено: не прочитано листов: 1'],
    })

    expect(r).toMatchObject({ started: true, picked: 2 })
    expect(startBatchEnrichMock).toHaveBeenCalledTimes(1)
  })
})

describe('что именно берём в прогон', () => {
  it('только новые, только с пустым описанием, только с предложениями, не больше потолка', async () => {
    await enrichAfterSync(NEW_IDS, CLEAN)

    const where = findMany.mock.calls[0][0].where
    expect(where.id).toEqual({ in: NEW_IDS })
    expect(where.variants).toEqual({ some: {} })
    expect(where.OR).toEqual([{ description: null }, { description: '' }])
    expect(findMany.mock.calls[0][0].take).toBe(ENRICH_AFTER_SYNC_MAX)
    expect(ENRICH_AFTER_SYNC_MAX).toBe(20)
  })

  it('прогон получает отобранные id, свой потолок и метку источника', async () => {
    await enrichAfterSync(NEW_IDS, CLEAN)

    expect(startBatchEnrichMock).toHaveBeenCalledWith('system:after_sync', {
      productIds: [101, 102],
      maxItems: ENRICH_AFTER_SYNC_MAX,
      source: 'after_sync',
    })
  })
})

describe('поломка обогащения не касается синка', () => {
  it('упавший запрос кандидатов не бросает наружу', async () => {
    findMany.mockRejectedValue(new Error('БД недоступна'))

    await expect(enrichAfterSync(NEW_IDS, CLEAN)).resolves.toEqual({ started: false })
  })

  it('исключение при запуске прогона не бросает наружу', async () => {
    startBatchEnrichMock.mockImplementation(() => { throw new Error('всё сломалось') })

    await expect(enrichAfterSync(NEW_IDS, CLEAN)).resolves.toEqual({ started: false })
  })

  it('падение чтения настройки не бросает наружу', async () => {
    readSetting.mockRejectedValue(new Error('нет ключа шифрования'))

    await expect(enrichAfterSync(NEW_IDS, CLEAN)).resolves.toEqual({ started: false, skipped: 'off' })
  })
})
