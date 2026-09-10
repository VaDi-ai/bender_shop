-- Разовые промо на витрине: кто уже видел.
--
-- Аддитивно: НОВАЯ пустая таблица, ни одной правки существующих. Бэкфилла нет —
-- пустая таблица читается как «никто ещё не видел», то есть ровно то же
-- поведение, что и до миграции (промо по умолчанию выключено).
--
-- UNIQUE тут есть, и это НЕ противоречит уроку #107: там констрейнт вешался на
-- уже заполненную таблицу и валил старт на существующих дублях. Здесь индекс
-- создаётся вместе с пустой таблицей — нарушать нечего.
--
-- Внешнего ключа нет намеренно: посетителя витрины может не быть ни в Client
-- (клиентом становятся при заказе), ни в AdminUser.

-- CreateTable
CREATE TABLE "PromoSeen" (
    "id" SERIAL NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "promoKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoSeen_promoKey_idx" ON "PromoSeen"("promoKey");

-- CreateIndex
CREATE UNIQUE INDEX "PromoSeen_telegramUserId_promoKey_key" ON "PromoSeen"("telegramUserId", "promoKey");
