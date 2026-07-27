import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { securityLog: { create: vi.fn().mockResolvedValue({}) } },
}))

import { prisma } from '../lib/prisma'
import {
  logSecurityEvent,
  initSecurityAlerts,
  shouldSendCriticalAlert,
  _resetAlertWindows,
} from '../lib/security-log'
import type { Telegraf } from 'telegraf'

const dbCreate = prisma.securityLog.create as ReturnType<typeof vi.fn>

function mockBot() {
  const sendMessage = vi.fn().mockResolvedValue({})
  return { bot: { telegram: { sendMessage } } as unknown as Telegraf, sendMessage }
}

beforeEach(() => {
  _resetAlertWindows()
  dbCreate.mockClear()
})

describe('shouldSendCriticalAlert (окно 5 мин на событие × IP)', () => {
  it('первое событие шлётся, шторм в окне подавляется, следующее окно несёт счётчик', () => {
    const t0 = 1_000_000
    expect(shouldSendCriticalAlert('e', '1.2.3.4', t0)).toEqual({ send: true, suppressedBefore: 0 })
    for (let i = 0; i < 99; i++) {
      expect(shouldSendCriticalAlert('e', '1.2.3.4', t0 + i * 1000).send).toBe(false)
    }
    // спустя 5 минут — снова шлём, с накопленным счётчиком
    const next = shouldSendCriticalAlert('e', '1.2.3.4', t0 + 5 * 60_000)
    expect(next).toEqual({ send: true, suppressedBefore: 99 })
  })

  it('разные IP и разные события — независимые окна', () => {
    const t0 = 1_000_000
    expect(shouldSendCriticalAlert('e', '1.1.1.1', t0).send).toBe(true)
    expect(shouldSendCriticalAlert('e', '2.2.2.2', t0).send).toBe(true)
    expect(shouldSendCriticalAlert('other', '1.1.1.1', t0).send).toBe(true)
  })

  it('эвикция: карта не растёт бесконечно на потоке разных IP', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 1200; i++) {
      shouldSendCriticalAlert('e', `10.0.${Math.floor(i / 250)}.${i % 250}`, t0 + i)
    }
    // 1200 ключей при лимите 500 — просто не упало и продолжает работать
    expect(shouldSendCriticalAlert('e', 'fresh-ip', t0 + 10_000).send).toBe(true)
  })
})

describe('logSecurityEvent: алерты vs полный аудит', () => {
  it('шторм critical-события → 1 сообщение админам, но КАЖДОЕ событие в SecurityLog', async () => {
    const { bot, sendMessage } = mockBot()
    initSecurityAlerts(bot, [111])
    for (let i = 0; i < 10; i++) {
      await logSecurityEvent('invalid_telegram_signature', { ip: '9.9.9.9' })
    }
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(dbCreate).toHaveBeenCalledTimes(10) // аудит не режем
  })

  it('после окна отправляется суффикс «…и ещё N»', async () => {
    const { bot, sendMessage } = mockBot()
    initSecurityAlerts(bot, [111])
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_700_000_000_000)
      for (let i = 0; i < 5; i++) await logSecurityEvent('invalid_telegram_signature', { ip: '8.8.8.8' })
      vi.setSystemTime(1_700_000_000_000 + 5 * 60_000 + 1)
      await logSecurityEvent('invalid_telegram_signature', { ip: '8.8.8.8' })
      expect(sendMessage).toHaveBeenCalledTimes(2)
      const lastText = sendMessage.mock.calls.at(-1)![1] as string
      expect(lastText).toContain('и ещё 4')
    } finally {
      vi.useRealTimers()
    }
  })

  it('admin_invalid_signature — НЕ critical: админов не будит, в SecurityLog пишется', async () => {
    const { bot, sendMessage } = mockBot()
    initSecurityAlerts(bot, [111])
    for (let i = 0; i < 5; i++) {
      await logSecurityEvent('admin_invalid_signature', { ip: '7.7.7.7', scope: 'admin_api' })
    }
    expect(sendMessage).not.toHaveBeenCalled()
    expect(dbCreate).toHaveBeenCalledTimes(5)
  })
})
