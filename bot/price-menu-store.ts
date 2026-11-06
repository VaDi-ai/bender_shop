import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export type PriceNode = { title: string; parent: string; children?: string[]; text?: string }
export type PriceMenuData = { version: 1; revision: number; nodes: Record<string, PriceNode> }
export type PriceMenuChange =
  | { action: 'add'; id: string; value: string }
  | { action: 'title' | 'text'; id: string; value: string }
  | { action: 'delete'; id: string }

function validate(data: PriceMenuData): void {
  if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !data.nodes || typeof data.nodes !== 'object' || !Object.prototype.hasOwnProperty.call(data.nodes, 'root')) throw new Error('Некорректный файл прайса')
  const entries = Object.entries(data.nodes)
  if (entries.length > 250) throw new Error('В меню может быть не больше 250 разделов')
  for (const [id, node] of entries) {
    if (!/^[a-z0-9_]{1,32}$/.test(id) || ['__proto__', 'constructor', 'prototype', 'home'].includes(id)
      || !node || typeof node.title !== 'string' || !node.title.trim() || node.title.length > 64
      || (node.text !== undefined && (typeof node.text !== 'string' || node.text.length > 3500))
      || (node.children !== undefined && (!Array.isArray(node.children) || node.children.length > 50))) {
      throw new Error('Название: 1–64 символа, текст: до 3500 символов, кнопок в разделе: до 50')
    }
  }
  const seen = new Set<string>()
  function visit(id: string, parent: string): void {
    if (seen.has(id) || !Object.prototype.hasOwnProperty.call(data.nodes, id) || data.nodes[id]!.parent !== parent) throw new Error('Нарушена структура меню')
    seen.add(id)
    for (const child of data.nodes[id]!.children ?? []) visit(child, id)
  }
  visit('root', 'home')
  if (seen.size !== entries.length) throw new Error('В меню есть недоступные разделы')
}

/** One process / one persistent volume. Atomic writes; never writes to the shop DB. */
export class PriceMenuStore {
  private data: PriceMenuData
  constructor(private readonly file: string | undefined, defaults: Record<string, PriceNode>) {
    this.data = { version: 1, revision: 0, nodes: structuredClone(defaults) }
    if (file) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')) as PriceMenuData }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    validate(this.data)
  }
  snapshot(): PriceMenuData { return structuredClone(this.data) }
  change(change: PriceMenuChange, expectedRevision: number): string {
    if (!this.file) throw new Error('Хранилище прайса не настроено. Изменения не сохранены.')
    if (this.data.revision !== expectedRevision) throw new Error('Меню уже изменилось. Откройте раздел заново и повторите.')
    const data = this.snapshot()
    if (!Object.prototype.hasOwnProperty.call(data.nodes, change.id)) throw new Error('Раздел уже удалён')
    const node = data.nodes[change.id]!
    let result = change.id
    if (change.action === 'add') {
      const id = 'n_' + randomBytes(8).toString('hex')
      data.nodes[id] = { title: change.value.trim(), parent: change.id }
      node.children = [...(node.children ?? []), id]
      result = id
    } else if (change.action === 'delete') {
      if (change.id === 'root') throw new Error('Главное меню удалить нельзя')
      result = node.parent
      data.nodes[node.parent]!.children = (data.nodes[node.parent]!.children ?? []).filter(id => id !== change.id)
      const remove = (id: string): void => {
        for (const child of data.nodes[id]!.children ?? []) remove(child)
        delete data.nodes[id]
      }
      remove(change.id)
    } else if (change.action === 'title') node.title = change.value.trim()
    else if (change.value.trim() === '-') delete node.text
    else node.text = change.value
    data.revision++
    validate(data)
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
    const temp = this.file + '.' + randomBytes(6).toString('hex') + '.tmp'
    try {
      // Preserve a last-good version before replacing the live file.
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak')
      const fd = fs.openSync(temp, 'wx', 0o600)
      try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd) }
      finally { fs.closeSync(fd) }
      fs.renameSync(temp, this.file)
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    this.data = data
    return result
  }
}
