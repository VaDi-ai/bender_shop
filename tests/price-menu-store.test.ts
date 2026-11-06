import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PriceMenuStore } from '../bot/price-menu-store'

const defaults = { root: { title: 'Прайс', parent: 'home', children: ['apple'] }, apple: { title: 'Apple', parent: 'root' } }
let dir: string, file: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-menu-test-')); file = path.join(dir, '.price', 'menu.json') })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('persistent manual menu', () => {
  it('persists text, names and new nested buttons through process restart without changing defaults', () => {
    const store = new PriceMenuStore(file, defaults)
    const id = store.change({ action: 'add', id: 'apple', value: 'iPhone' }, 0)
    store.change({ action: 'text', id, value: 'iPhone 18\n128 GB — 80 000 ₽\n☎️ Напишите нам' }, 1)
    store.change({ action: 'title', id, value: 'Телефоны' }, 2)
    const restored = new PriceMenuStore(file, defaults).snapshot()
    expect(restored.nodes[id]).toEqual({ title: 'Телефоны', parent: 'apple', text: 'iPhone 18\n128 GB — 80 000 ₽\n☎️ Напишите нам' })
    expect(restored.nodes.apple!.children).toEqual([id])
    expect(defaults.apple).toEqual({ title: 'Apple', parent: 'root' })
    expect(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).revision).toBe(2)
  })
  it('rejects stale writes and deletion including changes from another administrator', () => {
    const store = new PriceMenuStore(file, defaults)
    store.change({ action: 'text', id: 'apple', value: 'Saved' }, 0)
    expect(() => store.change({ action: 'delete', id: 'apple' }, 0)).toThrow('уже изменилось')
    expect(new PriceMenuStore(file, defaults).snapshot().nodes.apple!.text).toBe('Saved')
  })
  it('deletes a whole subtree and leaves a valid parent; root cannot be deleted', () => {
    const store = new PriceMenuStore(file, defaults)
    const id = store.change({ action: 'add', id: 'apple', value: 'Телефоны' }, 0)
    store.change({ action: 'add', id, value: 'iPhone' }, 1)
    expect(store.change({ action: 'delete', id: 'apple' }, 2)).toBe('root')
    expect(Object.keys(new PriceMenuStore(file, defaults).snapshot().nodes)).toEqual(['root'])
    expect(() => store.change({ action: 'delete', id: 'root' }, 3)).toThrow('нельзя')
  })
  it('supports clearing the price text', () => {
    const store = new PriceMenuStore(file, defaults)
    store.change({ action: 'text', id: 'apple', value: 'Цена' }, 0)
    store.change({ action: 'text', id: 'apple', value: '-' }, 1)
    expect(store.snapshot().nodes.apple!.text).toBeUndefined()
  })
  it('rejects invalid lengths without changing memory or disk', () => {
    const store = new PriceMenuStore(file, defaults)
    store.change({ action: 'text', id: 'apple', value: 'Saved' }, 0)
    for (const change of [
      { action: 'title' as const, id: 'apple', value: ' ' },
      { action: 'add' as const, id: 'root', value: 'x'.repeat(65) },
      { action: 'text' as const, id: 'apple', value: 'x'.repeat(3501) },
    ]) expect(() => store.change(change, 1)).toThrow()
    expect(store.snapshot().revision).toBe(1)
    expect(new PriceMenuStore(file, defaults).snapshot()).toEqual(store.snapshot())
  })
  it('does not silently overwrite corrupt saved data', () => {
    fs.mkdirSync(path.dirname(file))
    fs.writeFileSync(file, '{broken')
    expect(() => new PriceMenuStore(file, defaults)).toThrow()
    expect(fs.readFileSync(file, 'utf8')).toBe('{broken')
  })
  it('refuses edits without persistent storage', () => {
    const store = new PriceMenuStore(undefined, defaults)
    expect(() => store.change({ action: 'text', id: 'apple', value: 'X' }, 0)).toThrow('не настроено')
    expect(store.snapshot().revision).toBe(0)
  })
  it('keeps in-memory state intact if writing fails', () => {
    const store = new PriceMenuStore(file, defaults)
    fs.writeFileSync(path.dirname(file), 'not a directory')
    expect(() => store.change({ action: 'text', id: 'apple', value: 'X' }, 0)).toThrow()
    expect(store.snapshot().revision).toBe(0)
  })
})
