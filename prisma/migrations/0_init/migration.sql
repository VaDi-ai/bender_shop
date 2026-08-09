-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClientSource" AS ENUM ('avito', 'instagram', 'telegram', 'shop');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'done', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('followup', 'offer', 'reactivation', 'announcement');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('in', 'out', 'reserve', 'sale');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('new', 'processing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderPayment" AS ENUM ('cash', 'card', 'transfer', 'crm');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "FilterType" AS ENUM ('category', 'brand', 'attribute', 'products');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "BroadcastType" AS ENUM ('all', 'tag', 'segment');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('photo', 'video');

-- CreateTable
CREATE TABLE "Segment" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "source" "ClientSource" NOT NULL,
    "externalId" TEXT,
    "segmentId" INTEGER,
    "notes" TEXT,
    "telegramUsername" TEXT,
    "telegramTopicId" INTEGER,
    "pinnedMessageId" INTEGER,
    "phone" TEXT,
    "fullName" TEXT,
    "email" TEXT,
    "birthDate" TEXT,
    "pdnConsentAt" TIMESTAMP(3),
    "lastPurchaseDate" TIMESTAMP(3),
    "totalPurchases" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "source" "ClientSource" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "autoAction" JSONB,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "textSide" TEXT NOT NULL DEFAULT 'left',
    "imageFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRegion" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flag" TEXT,
    "currency" VARCHAR(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "categoryId" INTEGER,
    "photoUrl" TEXT,
    "coverPhoto" TEXT,
    "photos" TEXT[],
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB,
    "specs" JSONB,
    "badge" TEXT,
    "brand" TEXT,
    "avitoItemId" BIGINT,
    "avitoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "line" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "attributes" JSONB NOT NULL,
    "photos" TEXT[],
    "costPrice" DECIMAL(12,2),
    "lastSyncedCostPrice" DECIMAL(12,2),
    "photoUrls" TEXT[],
    "bestSupplierName" TEXT,
    "priceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER,
    "telegramId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "payment" "OrderPayment" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'new',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "deliveryType" "DeliveryType",
    "deliveryAddress" TEXT,
    "customerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAtPurchase" DECIMAL(12,2) NOT NULL,
    "productName" TEXT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'active',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "service" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroBanner" (
    "id" SERIAL NOT NULL,
    "imageFile" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeroBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandImage" (
    "id" SERIAL NOT NULL,
    "brandNorm" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "imageFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastLog" (
    "id" SERIAL NOT NULL,
    "type" "BroadcastType" NOT NULL,
    "target" TEXT NOT NULL,
    "messageText" TEXT,
    "mediaFileId" TEXT,
    "mediaType" "MediaType",
    "totalSent" INTEGER NOT NULL,
    "totalFailed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "adminTelegramId" BIGINT,

    CONSTRAINT "BroadcastLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "filterType" "FilterType" NOT NULL,
    "filterValue" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionPrice" (
    "id" SERIAL NOT NULL,
    "promotionId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,
    "originalPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PromotionPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "oldPrice" DECIMAL(12,2) NOT NULL,
    "newPrice" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL,
    "markup" DECIMAL(6,2),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "batchId" INTEGER,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" SERIAL NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "previousRate" DECIMAL(12,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatType" TEXT NOT NULL DEFAULT 'group',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "markup" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "priceTtlDays" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "lastPriceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "model" TEXT NOT NULL,
    "storage" TEXT,
    "ram" TEXT,
    "color" TEXT,
    "simType" TEXT,
    "country" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "variantId" INTEGER,
    "supplierName" TEXT,
    "productName" TEXT,
    "rawMessage" TEXT NOT NULL,
    "messageId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" INTEGER,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityLog" (
    "id" SERIAL NOT NULL,
    "event" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ip" TEXT,
    "adminTelegramId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAlias" (
    "id" SERIAL NOT NULL,
    "alias" TEXT NOT NULL,
    "productId" INTEGER,
    "variantId" INTEGER,
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "clientId" INTEGER,
    "productId" INTEGER,
    "data" JSONB,
    "source" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoStat" (
    "id" SERIAL NOT NULL,
    "listingId" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "parameter" TEXT,
    "title" TEXT,
    "price" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "daysOnAvito" INTEGER,
    "impressions" INTEGER,
    "views" INTEGER,
    "viewConversion" DOUBLE PRECISION,
    "avgViewPrice" DOUBLE PRECISION,
    "contacts" INTEGER,
    "contactConversion" DOUBLE PRECISION,
    "chats" INTEGER,
    "phoneLooks" INTEGER,
    "favorites" INTEGER,
    "avgContactPrice" DOUBLE PRECISION,
    "totalSpend" DOUBLE PRECISION,
    "promoSpend" DOUBLE PRECISION,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvitoStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellPrice" DOUBLE PRECISION NOT NULL,
    "extraCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profit" DOUBLE PRECISION NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoItemStat" (
    "id" SERIAL NOT NULL,
    "avitoItemId" TEXT NOT NULL,
    "title" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "uniqViews" INTEGER NOT NULL DEFAULT 0,
    "uniqContacts" INTEGER NOT NULL DEFAULT 0,
    "uniqFavorites" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvitoItemStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkupRule" (
    "id" SERIAL NOT NULL,
    "minCost" DECIMAL(12,2) NOT NULL,
    "maxCost" DECIMAL(12,2),
    "mode" TEXT NOT NULL DEFAULT 'fixed',
    "value" DECIMAL(12,2) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'site',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkupRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "adminTelegramId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" SERIAL NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'sheet_to_db',
    "trigger" TEXT NOT NULL,
    "startedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "rowsRead" INTEGER,
    "created" INTEGER,
    "updated" INTEGER,
    "disabled" INTEGER,
    "writebacks" INTEGER,
    "errors" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimRule" (
    "id" SERIAL NOT NULL,
    "country" TEXT,
    "countryNorm" TEXT NOT NULL DEFAULT '',
    "brandNorm" TEXT NOT NULL DEFAULT '',
    "modelMatch" TEXT NOT NULL DEFAULT '',
    "modelGenFrom" INTEGER NOT NULL DEFAULT 0,
    "brand" TEXT,
    "simType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrValueAlias" (
    "id" SERIAL NOT NULL,
    "attrKey" TEXT NOT NULL,
    "rawNorm" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttrValueAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceApplyBatch" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'parsing',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "stats" JSONB,

    CONSTRAINT "PriceApplyBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Segment_name_key" ON "Segment"("name");

-- CreateIndex
CREATE INDEX "Client_segmentId_idx" ON "Client"("segmentId");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_telegramTopicId_idx" ON "Client"("telegramTopicId");

-- CreateIndex
CREATE INDEX "Client_createdAt_idx" ON "Client"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_source_externalId_key" ON "Client"("source", "externalId");

-- CreateIndex
CREATE INDEX "Message_clientId_idx" ON "Message"("clientId");

-- CreateIndex
CREATE INDEX "Message_isRead_idx" ON "Message"("isRead");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Tag_clientId_idx" ON "Tag"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_clientId_name_key" ON "Tag"("clientId", "name");

-- CreateIndex
CREATE INDEX "Task_status_scheduledAt_idx" ON "Task"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_action_status_idx" ON "Task"("action", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_key" ON "Template"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRegion_code_key" ON "ShopRegion"("code");

-- CreateIndex
CREATE INDEX "ShopRegion_isActive_idx" ON "ShopRegion"("isActive");

-- CreateIndex
CREATE INDEX "ShopRegion_sortOrder_idx" ON "ShopRegion"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_avitoItemId_key" ON "Product"("avitoItemId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_isAvailable_idx" ON "Product"("isAvailable");

-- CreateIndex
CREATE INDEX "Product_isFeatured_idx" ON "Product"("isFeatured");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_avitoEnabled_idx" ON "Product"("avitoEnabled");

-- CreateIndex
CREATE INDEX "Product_brand_line_idx" ON "Product"("brand", "line");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_inStock_idx" ON "ProductVariant"("inStock");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_idx" ON "StockMovement"("variantId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "Order_telegramId_idx" ON "Order"("telegramId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_clientId_idx" ON "Order"("clientId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "Reservation_clientId_idx" ON "Reservation"("clientId");

-- CreateIndex
CREATE INDEX "Reservation_productId_idx" ON "Reservation"("productId");

-- CreateIndex
CREATE INDEX "Reservation_variantId_idx" ON "Reservation"("variantId");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_createdAt_idx" ON "Reservation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_service_key" ON "ApiKey"("service");

-- CreateIndex
CREATE INDEX "HeroBanner_isActive_order_idx" ON "HeroBanner"("isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "BrandImage_brandNorm_key" ON "BrandImage"("brandNorm");

-- CreateIndex
CREATE INDEX "BroadcastLog_createdBy_idx" ON "BroadcastLog"("createdBy");

-- CreateIndex
CREATE INDEX "BroadcastLog_type_idx" ON "BroadcastLog"("type");

-- CreateIndex
CREATE INDEX "BroadcastLog_adminTelegramId_idx" ON "BroadcastLog"("adminTelegramId");

-- CreateIndex
CREATE INDEX "Promotion_isActive_idx" ON "Promotion"("isActive");

-- CreateIndex
CREATE INDEX "Promotion_startsAt_endsAt_idx" ON "Promotion"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PromotionPrice_variantId_idx" ON "PromotionPrice"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionPrice_promotionId_variantId_key" ON "PromotionPrice"("promotionId", "variantId");

-- CreateIndex
CREATE INDEX "PriceChange_variantId_idx" ON "PriceChange"("variantId");

-- CreateIndex
CREATE INDEX "PriceChange_createdAt_idx" ON "PriceChange"("createdAt");

-- CreateIndex
CREATE INDEX "PriceChange_batchId_idx" ON "PriceChange"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyRate_currency_key" ON "CurrencyRate"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_chatId_key" ON "Supplier"("chatId");

-- CreateIndex
CREATE INDEX "Supplier_chatId_idx" ON "Supplier"("chatId");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateIndex
CREATE INDEX "SupplierPrice_supplierId_idx" ON "SupplierPrice"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPrice_model_idx" ON "SupplierPrice"("model");

-- CreateIndex
CREATE INDEX "SupplierPrice_parsedAt_idx" ON "SupplierPrice"("parsedAt");

-- CreateIndex
CREATE INDEX "SupplierPrice_isActive_model_idx" ON "SupplierPrice"("isActive", "model");

-- CreateIndex
CREATE INDEX "SupplierPrice_variantId_idx" ON "SupplierPrice"("variantId");

-- CreateIndex
CREATE INDEX "SupplierPrice_batchId_idx" ON "SupplierPrice"("batchId");

-- CreateIndex
CREATE INDEX "SecurityLog_event_idx" ON "SecurityLog"("event");

-- CreateIndex
CREATE INDEX "SecurityLog_createdAt_idx" ON "SecurityLog"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityLog_adminTelegramId_idx" ON "SecurityLog"("adminTelegramId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceAlias_alias_key" ON "PriceAlias"("alias");

-- CreateIndex
CREATE INDEX "PriceAlias_alias_idx" ON "PriceAlias"("alias");

-- CreateIndex
CREATE INDEX "PriceAlias_productId_idx" ON "PriceAlias"("productId");

-- CreateIndex
CREATE INDEX "PriceAlias_variantId_idx" ON "PriceAlias"("variantId");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Event_clientId_idx" ON "Event"("clientId");

-- CreateIndex
CREATE INDEX "Event_productId_idx" ON "Event"("productId");

-- CreateIndex
CREATE INDEX "Event_sessionId_idx" ON "Event"("sessionId");

-- CreateIndex
CREATE INDEX "AvitoStat_category_idx" ON "AvitoStat"("category");

-- CreateIndex
CREATE INDEX "AvitoStat_subcategory_idx" ON "AvitoStat"("subcategory");

-- CreateIndex
CREATE INDEX "AvitoStat_publishedAt_idx" ON "AvitoStat"("publishedAt");

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE INDEX "Sale_productName_idx" ON "Sale"("productName");

-- CreateIndex
CREATE INDEX "AvitoItemStat_avitoItemId_idx" ON "AvitoItemStat"("avitoItemId");

-- CreateIndex
CREATE INDEX "AvitoItemStat_date_idx" ON "AvitoItemStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoItemStat_avitoItemId_date_key" ON "AvitoItemStat"("avitoItemId", "date");

-- CreateIndex
CREATE INDEX "MarkupRule_enabled_idx" ON "MarkupRule"("enabled");

-- CreateIndex
CREATE INDEX "MarkupRule_minCost_idx" ON "MarkupRule"("minCost");

-- CreateIndex
CREATE INDEX "MarkupRule_channel_enabled_idx" ON "MarkupRule"("channel", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_telegramId_key" ON "AdminUser"("telegramId");

-- CreateIndex
CREATE INDEX "AdminUser_isActive_idx" ON "AdminUser"("isActive");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminTelegramId_idx" ON "AuditLog"("adminTelegramId");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "SimRule_countryNorm_idx" ON "SimRule"("countryNorm");

-- CreateIndex
CREATE INDEX "SimRule_modelMatch_idx" ON "SimRule"("modelMatch");

-- CreateIndex
CREATE UNIQUE INDEX "SimRule_countryNorm_brandNorm_modelMatch_modelGenFrom_key" ON "SimRule"("countryNorm", "brandNorm", "modelMatch", "modelGenFrom");

-- CreateIndex
CREATE INDEX "AttrValueAlias_attrKey_idx" ON "AttrValueAlias"("attrKey");

-- CreateIndex
CREATE UNIQUE INDEX "AttrValueAlias_attrKey_rawNorm_key" ON "AttrValueAlias"("attrKey", "rawNorm");

-- CreateIndex
CREATE INDEX "PriceApplyBatch_status_idx" ON "PriceApplyBatch"("status");

-- CreateIndex
CREATE INDEX "PriceApplyBatch_createdAt_idx" ON "PriceApplyBatch"("createdAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPrice" ADD CONSTRAINT "PromotionPrice_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPrice" ADD CONSTRAINT "PromotionPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PriceApplyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PriceApplyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceApplyBatch" ADD CONSTRAINT "PriceApplyBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

