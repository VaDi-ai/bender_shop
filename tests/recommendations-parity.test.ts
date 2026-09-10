/**
 * Паритет двух копий подбора рекомендаций.
 *
 * Живой подбор для покупателя считает витрина (инлайн-скрипт в
 * webapp/index.html), его порт в lib/recommendations.ts показывает владельцу
 * админка. Разъедутся — владелец будет править ленту, которой покупатель не
 * видит, и это никак себя не проявит.
 *
 * Поэтому клиентские функции берутся ИЗ САМОГО index.html и гоняются на той же
 * фикстуре, что и серверные. Фикстура одна и намеренно задевает все три корзины
 * алгоритма плюс обе ветки наложения замен.
 */
import { describe, it, expect } from 'vitest'
import { autoRecommendations, resolveRecSlots, REC_SLOTS, type RecCandidate } from '../lib/recommendations'
import { loadClientRecs, type ClientProduct } from './helpers/client-recs'

const client = loadClientRecs()

/**
 * Товар в двух видах сразу: как его читает витрина (payload /api/products с
 * вариантами) и как его читает сервер (уже посчитанная минимальная цена).
 */
function product(
  id: number, name: string, category: string, price: number, brand = 'Apple',
): { client: ClientProduct; server: RecCandidate } {
  return {
    client: {
      id, name, brand, category,
      price: String(price),
      variants: [{ price: String(price), inStock: true }],
    },
    server: { id, name, brand, category, price },
  }
}

const FIXTURE = [
  product(1, 'iPhone 17 Pro', 'iPhone', 120000),
  product(2, 'AirPods Pro 3', 'Аксессуары', 22000),
  product(3, 'Чехол MagSafe для iPhone', 'Аксессуары', 5000),
  product(4, 'AirTag', 'Аксессуары', 3000),
  product(5, 'MacBook Air M5', 'MacBook', 130000),
  product(6, 'Apple Watch S11', 'Watch', 45000),
  product(7, 'iPhone 17', 'iPhone', 90000),
  product(8, 'iPhone Air', 'iPhone', 110000),
  product(9, 'Galaxy S26 Ultra', 'Galaxy S', 95000, 'Samsung'),
  product(10, 'Ремешок Milanese Loop', 'Аксессуары', 9000),
  // Второй бренд не для галочки: на нём проверяется, что «свой» бренд считают
  // одинаково обе копии, а не только Apple с его ветками регулярок
  product(11, 'Galaxy S26', 'Galaxy S', 80000, 'Samsung'),
  product(12, 'Galaxy Buds 3', 'Аксессуары', 12000, 'Samsung'),
  product(13, 'Galaxy Watch 8', 'Watch', 30000, 'Samsung'),
]
const allClient = FIXTURE.map(f => f.client)
const allServer = FIXTURE.map(f => f.server)

const serverAuto = (id: number) =>
  autoRecommendations(allServer.find(p => p.id === id)!, allServer, REC_SLOTS).map(a => a.productId)
const clientAuto = (id: number) =>
  client.getRecommendations(allClient.find(p => p.id === id)!, allClient, REC_SLOTS).map(p => p.id)

describe('витрина и сервер подбирают одинаково', () => {
  // Разные типы товара включают разные ветки регулярок в первой корзине
  for (const id of [1, 5, 6, 7, 9]) {
    it(`товар #${id}: авто-подбор совпадает`, () => {
      const fromServer = serverAuto(id)
      expect(fromServer).toEqual(clientAuto(id))
      expect(fromServer.length).toBeGreaterThan(0)   // фикстура должна что-то подбирать, иначе тест пустой
    })
  }

  it('порядок, а не только состав', () => {
    // toEqual на массивах и так учитывает порядок — фиксируем это явно:
    // именно порядок задаёт, что покупатель видит первым
    expect(serverAuto(1)).not.toEqual([...serverAuto(1)].reverse())
    expect(serverAuto(1)).toEqual(clientAuto(1))
  })
})

describe('наложение ручных замен совпадает', () => {
  const cases: Array<{ title: string; manual: number[] }> = [
    { title: 'без замен', manual: [] },
    { title: 'одни нули', manual: [0, 0, 0, 0] },
    { title: 'замена в середине', manual: [0, 0, 7, 0] },
    { title: 'замена на первом слоте', manual: [9, 0, 0, 0] },
    { title: 'закреплён товар, который и так подобрал алгоритм', manual: [0, 0, 0, 2] },
    { title: 'все слоты заняты руками', manual: [9, 7, 8, 10] },
    { title: 'массив короче ленты', manual: [0, 7] },
  ]

  for (const c of cases) {
    it(c.title, () => {
      const self = allServer.find(p => p.id === 1)!
      const fromServer = resolveRecSlots(c.manual, autoRecommendations(self, allServer, REC_SLOTS), REC_SLOTS)
        .map(s => s.productId)
      const fromClient = client
        .resolveRecs({ ...allClient.find(p => p.id === 1)!, recommendedIds: c.manual } as ClientProduct, allClient, REC_SLOTS)
        .map(p => p.id)
      expect(fromServer).toEqual(fromClient)
    })
  }

  it('без замен витрина идёт старой веткой — результат тот же, что у чистого алгоритма', () => {
    const self = allClient.find(p => p.id === 1)!
    expect(client.resolveRecs(self, allClient, REC_SLOTS).map(p => p.id))
      .toEqual(client.getRecommendations(self, allClient, REC_SLOTS).map(p => p.id))
  })
})
