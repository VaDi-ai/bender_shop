-- Архивный статус варианта: схлопнутый дубль или вариант товара-призрака.
-- Аддитивно и обратимо: колонка nullable, старые строки не трогаем (NULL =
-- обычный вариант). Снятие archivedAt в NULL возвращает вариант в работу.
--
-- Зачем отдельный флаг, а не остаток: честно распроданный вариант живого
-- товара тоже имеет quantity=0, и по остатку его нельзя отличить от дубля.
-- Пикер привязки (/admin/api/variants) прячет ТОЛЬКО archivedAt IS NOT NULL.

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProductVariant_archivedAt_idx" ON "ProductVariant"("archivedAt");
