import * as runtime from "@prisma/client/runtime/client";
import * as $Class from "./internal/class";
import * as Prisma from "./internal/prismaNamespace";
export * as $Enums from './enums';
export * from "./enums";
/**
 * ## Prisma Client
 *
 * Type-safe database client for TypeScript
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Segments
 * const segments = await prisma.segment.findMany()
 * ```
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export declare const PrismaClient: $Class.PrismaClientConstructor;
export type PrismaClient<LogOpts extends Prisma.LogLevel = never, OmitOpts extends Prisma.PrismaClientOptions["omit"] = Prisma.PrismaClientOptions["omit"], ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = $Class.PrismaClient<LogOpts, OmitOpts, ExtArgs>;
export { Prisma };
/**
 * Model Segment
 *
 */
export type Segment = Prisma.SegmentModel;
/**
 * Model Client
 *
 */
export type Client = Prisma.ClientModel;
/**
 * Model Message
 *
 */
export type Message = Prisma.MessageModel;
/**
 * Model Tag
 *
 */
export type Tag = Prisma.TagModel;
/**
 * Model Task
 *
 */
export type Task = Prisma.TaskModel;
/**
 * Model Template
 *
 */
export type Template = Prisma.TemplateModel;
/**
 * Model Category
 *
 */
export type Category = Prisma.CategoryModel;
/**
 * Model Product
 *
 */
export type Product = Prisma.ProductModel;
/**
 * Model ProductVariant
 *
 */
export type ProductVariant = Prisma.ProductVariantModel;
/**
 * Model StockMovement
 *
 */
export type StockMovement = Prisma.StockMovementModel;
/**
 * Model Order
 *
 */
export type Order = Prisma.OrderModel;
/**
 * Model Reservation
 *
 */
export type Reservation = Prisma.ReservationModel;
/**
 * Model ApiKey
 *
 */
export type ApiKey = Prisma.ApiKeyModel;
/**
 * Model Region
 *
 */
export type Region = Prisma.RegionModel;
/**
 * Model HeroBanner
 *
 */
export type HeroBanner = Prisma.HeroBannerModel;
/**
 * Model BroadcastLog
 *
 */
export type BroadcastLog = Prisma.BroadcastLogModel;
/**
 * Model Promotion
 *
 */
export type Promotion = Prisma.PromotionModel;
/**
 * Model PromotionPrice
 *
 */
export type PromotionPrice = Prisma.PromotionPriceModel;
/**
 * Model PriceChange
 *
 */
export type PriceChange = Prisma.PriceChangeModel;
/**
 * Model CurrencyRate
 *
 */
export type CurrencyRate = Prisma.CurrencyRateModel;
/**
 * Model SecurityLog
 *
 */
export type SecurityLog = Prisma.SecurityLogModel;
//# sourceMappingURL=client.d.ts.map