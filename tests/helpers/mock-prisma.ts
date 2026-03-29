import { vi } from 'vitest'

export function createMockPrisma() {
  const mock: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    order: {
      create: vi.fn().mockResolvedValue({ id: 1, totalAmount: 100000 }),
      aggregate: vi.fn().mockResolvedValue({ _count: 0, _sum: { totalAmount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    client: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    event: {
      create: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    sale: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    avitoStat: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }

  return {
    ...mock,
    $transaction: vi.fn().mockImplementation(async (fn: unknown) => {
      if (typeof fn === 'function') return fn(mock)
      return Promise.all(fn as Promise<unknown>[])
    }),
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  }
}
