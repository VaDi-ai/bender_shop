import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
let dir: string | undefined
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); if (dir) fs.rmSync(dir, { recursive: true, force: true }) })
it('shows manually saved text and buttons to buyers and keeps them after restart', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-persistence-test-'))
  vi.stubEnv('PHOTOS_DIR', dir)
  vi.stubEnv('PRICE_MENU_FILE', '')
  vi.resetModules()
  const menu = await import('../bot/price-menu')
  const store = menu.getPriceMenuStore()
  const id = store.change({ action: 'add', id: 'root', value: 'Новый раздел' }, 0)
  store.change({ action: 'text', id, value: 'Товар — 12 000 ₽\nПод заказ' }, 1)
  const page = menu.buildPriceMenuPage(id, 'client')!
  expect(page.text).toBe('Новый раздел\n\nТовар — 12 000 ₽\nПод заказ')
  expect(page.reply_markup.inline_keyboard).toEqual([[{ text: 'Назад', callback_data: 'price:client:root' }]])
  expect(menu.buildPriceMenuPage('root', 'client')!.reply_markup.inline_keyboard.flat()).toContainEqual({ text: 'Новый раздел', callback_data: `price:client:${id}` })
  vi.resetModules()
  const restarted = await import('../bot/price-menu')
  expect(restarted.buildPriceMenuPage(id, 'client')).toEqual(page)
  restarted.getPriceMenuStore().change({ action: 'delete', id }, 2)
  expect(restarted.buildPriceMenuPage(id, 'client')).toBeUndefined()
})
