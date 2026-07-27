import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    // Интеграционные тесты делят одну тестовую БД и чистят таблицы в
    // beforeEach (deleteMany по Supplier/SupplierPrice/AuditLog/Product) —
    // параллельные файлы гонялись бы за одни строки. Последовательно.
    fileParallelism: false,
  },
})
