-- Платная доставка: nullable-колонки Order, старые строки не трогаем.
-- deliveryCost NULL при deliveryType='delivery' = «стоимость уточнит оператор».

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryCost" DECIMAL(12,2),
ADD COLUMN     "deliveryDistanceKm" INTEGER,
ADD COLUMN     "deliveryGeoLat" DECIMAL(9,6),
ADD COLUMN     "deliveryGeoLon" DECIMAL(9,6),
ADD COLUMN     "deliveryQcGeo" INTEGER,
ADD COLUMN     "deliveryZone" TEXT;
