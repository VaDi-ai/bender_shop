-- Предзаказ: всё аддитивно. Ни одного UNIQUE (урок #107: unique на старте
-- валит db push/migrate и гасит контейнер), ни одного NOT NULL без дефолта —
-- существующие строки не трогаются и остаются обычными товарами.
--
-- Флаг isPreorder приезжает из опциональной колонки листа; условия предоплаты
-- DB-only (синк их не пишет). Суммы в Order считает сервер на чекауте.

-- CreateEnum
CREATE TYPE "PreorderMode" AS ENUM ('full', 'partial');

-- CreateEnum
CREATE TYPE "PrepaymentKind" AS ENUM ('percent', 'fixed');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isPreorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preorderEta" TEXT,
ADD COLUMN     "preorderMode" "PreorderMode",
ADD COLUMN     "preorderTerms" TEXT,
ADD COLUMN     "prepaymentKind" "PrepaymentKind",
ADD COLUMN     "prepaymentValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "isPreorder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isPreorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preorderTermsSnapshot" TEXT,
ADD COLUMN     "prepaymentAmount" DECIMAL(12,2),
ADD COLUMN     "remainingAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "isPreorder" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Product_isPreorder_idx" ON "Product"("isPreorder");

-- CreateIndex
CREATE INDEX "ProductVariant_isPreorder_idx" ON "ProductVariant"("isPreorder");
