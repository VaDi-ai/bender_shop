/**
 * Достаёт живой клиентский подбор рекомендаций прямо из webapp/index.html.
 *
 * Алгоритм существует в двух копиях: инлайн-скрипт витрины (то, что реально
 * видит покупатель) и его порт в lib/recommendations.ts (то, что показывает
 * админка). Тест паритета обязан сравнивать с НАСТОЯЩИМ кодом витрины, а не с
 * его пересказом в фикстуре — иначе разъехавшиеся правила он не поймает.
 *
 * Поэтому функции вырезаются из html по имени и исполняются как есть. Ломается
 * извлечение — падает тест: это тоже сигнал, что копии разошлись.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const INDEX = join(__dirname, '..', '..', 'webapp', 'index.html')

/** Вырезает `function name(...) { ... }` по балансу фигурных скобок. */
function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`webapp/index.html: не нашли function ${name}()`)
  let depth = 0
  let i = src.indexOf('{', start)
  const open = i
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error(`webapp/index.html: не сошлись скобки у ${name}() (открыта на ${open})`)
}

export interface ClientProduct {
  id: number
  name: string
  brand?: string | null
  category?: string
  price: number | string
  variants?: Array<{ price: number | string; inStock?: boolean; isPreorder?: boolean }>
}

export interface ClientRecs {
  getRecommendations(p: ClientProduct, all: ClientProduct[], limit?: number): ClientProduct[]
  resolveRecs(p: ClientProduct, all: ClientProduct[], limit?: number): ClientProduct[]
}

/** Собирает песочницу с клиентскими функциями подбора и их зависимостями. */
export function loadClientRecs(): ClientRecs {
  const src = readFileSync(INDEX, 'utf8')
  const parts = ['isBuyable', 'minVariantPrice', 'getRecommendations', 'resolveRecs']
    .map(n => extractFunction(src, n))
    .join('\n')
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function(`${parts}\nreturn { getRecommendations, resolveRecs }`)
  return make() as ClientRecs
}
