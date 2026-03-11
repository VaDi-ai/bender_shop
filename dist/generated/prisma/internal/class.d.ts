import * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "./prismaNamespace";
export type LogOptions<ClientOptions extends Prisma.PrismaClientOptions> = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never;
export interface PrismaClientConstructor {
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
    new <Options extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions, LogOpts extends LogOptions<Options> = LogOptions<Options>, OmitOpts extends Prisma.PrismaClientOptions['omit'] = Options extends {
        omit: infer U;
    } ? U : Prisma.PrismaClientOptions['omit'], ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs>(options: Prisma.Subset<Options, Prisma.PrismaClientOptions>): PrismaClient<LogOpts, OmitOpts, ExtArgs>;
}
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
export interface PrismaClient<in LogOpts extends Prisma.LogLevel = never, in out OmitOpts extends Prisma.PrismaClientOptions['omit'] = undefined, in out ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['other'];
    };
    $on<V extends LogOpts>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;
    /**
     * Connect with the database
     */
    $connect(): runtime.Types.Utils.JsPromise<void>;
    /**
     * Disconnect from the database
     */
    $disconnect(): runtime.Types.Utils.JsPromise<void>;
    /**
       * Executes a prepared raw query and returns the number of affected rows.
       * @example
       * ```
       * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
       * ```
       *
       * Read more in our [docs](https://pris.ly/d/raw-queries).
       */
    $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;
    /**
     * Executes a raw query and returns the number of affected rows.
     * Susceptible to SQL injections, see documentation.
     * @example
     * ```
     * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
     * ```
     *
     * Read more in our [docs](https://pris.ly/d/raw-queries).
     */
    $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;
    /**
     * Performs a prepared raw query and returns the `SELECT` data.
     * @example
     * ```
     * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
     * ```
     *
     * Read more in our [docs](https://pris.ly/d/raw-queries).
     */
    $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;
    /**
     * Performs a raw query and returns the `SELECT` data.
     * Susceptible to SQL injections, see documentation.
     * @example
     * ```
     * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
     * ```
     *
     * Read more in our [docs](https://pris.ly/d/raw-queries).
     */
    $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;
    /**
     * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
     * @example
     * ```
     * const [george, bob, alice] = await prisma.$transaction([
     *   prisma.user.create({ data: { name: 'George' } }),
     *   prisma.user.create({ data: { name: 'Bob' } }),
     *   prisma.user.create({ data: { name: 'Alice' } }),
     * ])
     * ```
     *
     * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
     */
    $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: {
        isolationLevel?: Prisma.TransactionIsolationLevel;
    }): runtime.Types.Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>;
    $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => runtime.Types.Utils.JsPromise<R>, options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    }): runtime.Types.Utils.JsPromise<R>;
    $extends: runtime.Types.Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<OmitOpts>, ExtArgs, runtime.Types.Utils.Call<Prisma.TypeMapCb<OmitOpts>, {
        extArgs: ExtArgs;
    }>>;
    /**
 * `prisma.segment`: Exposes CRUD operations for the **Segment** model.
  * Example usage:
  * ```ts
  * // Fetch zero or more Segments
  * const segments = await prisma.segment.findMany()
  * ```
  */
    get segment(): Prisma.SegmentDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.client`: Exposes CRUD operations for the **Client** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Clients
      * const clients = await prisma.client.findMany()
      * ```
      */
    get client(): Prisma.ClientDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.message`: Exposes CRUD operations for the **Message** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Messages
      * const messages = await prisma.message.findMany()
      * ```
      */
    get message(): Prisma.MessageDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.tag`: Exposes CRUD operations for the **Tag** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Tags
      * const tags = await prisma.tag.findMany()
      * ```
      */
    get tag(): Prisma.TagDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.task`: Exposes CRUD operations for the **Task** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Tasks
      * const tasks = await prisma.task.findMany()
      * ```
      */
    get task(): Prisma.TaskDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.template`: Exposes CRUD operations for the **Template** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Templates
      * const templates = await prisma.template.findMany()
      * ```
      */
    get template(): Prisma.TemplateDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.category`: Exposes CRUD operations for the **Category** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Categories
      * const categories = await prisma.category.findMany()
      * ```
      */
    get category(): Prisma.CategoryDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.product`: Exposes CRUD operations for the **Product** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Products
      * const products = await prisma.product.findMany()
      * ```
      */
    get product(): Prisma.ProductDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.productVariant`: Exposes CRUD operations for the **ProductVariant** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more ProductVariants
      * const productVariants = await prisma.productVariant.findMany()
      * ```
      */
    get productVariant(): Prisma.ProductVariantDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.stockMovement`: Exposes CRUD operations for the **StockMovement** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more StockMovements
      * const stockMovements = await prisma.stockMovement.findMany()
      * ```
      */
    get stockMovement(): Prisma.StockMovementDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.order`: Exposes CRUD operations for the **Order** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Orders
      * const orders = await prisma.order.findMany()
      * ```
      */
    get order(): Prisma.OrderDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.reservation`: Exposes CRUD operations for the **Reservation** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Reservations
      * const reservations = await prisma.reservation.findMany()
      * ```
      */
    get reservation(): Prisma.ReservationDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.apiKey`: Exposes CRUD operations for the **ApiKey** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more ApiKeys
      * const apiKeys = await prisma.apiKey.findMany()
      * ```
      */
    get apiKey(): Prisma.ApiKeyDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.region`: Exposes CRUD operations for the **Region** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Regions
      * const regions = await prisma.region.findMany()
      * ```
      */
    get region(): Prisma.RegionDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.heroBanner`: Exposes CRUD operations for the **HeroBanner** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more HeroBanners
      * const heroBanners = await prisma.heroBanner.findMany()
      * ```
      */
    get heroBanner(): Prisma.HeroBannerDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.broadcastLog`: Exposes CRUD operations for the **BroadcastLog** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more BroadcastLogs
      * const broadcastLogs = await prisma.broadcastLog.findMany()
      * ```
      */
    get broadcastLog(): Prisma.BroadcastLogDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.promotion`: Exposes CRUD operations for the **Promotion** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more Promotions
      * const promotions = await prisma.promotion.findMany()
      * ```
      */
    get promotion(): Prisma.PromotionDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.promotionPrice`: Exposes CRUD operations for the **PromotionPrice** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more PromotionPrices
      * const promotionPrices = await prisma.promotionPrice.findMany()
      * ```
      */
    get promotionPrice(): Prisma.PromotionPriceDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.priceChange`: Exposes CRUD operations for the **PriceChange** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more PriceChanges
      * const priceChanges = await prisma.priceChange.findMany()
      * ```
      */
    get priceChange(): Prisma.PriceChangeDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.currencyRate`: Exposes CRUD operations for the **CurrencyRate** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more CurrencyRates
      * const currencyRates = await prisma.currencyRate.findMany()
      * ```
      */
    get currencyRate(): Prisma.CurrencyRateDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
    /**
     * `prisma.securityLog`: Exposes CRUD operations for the **SecurityLog** model.
      * Example usage:
      * ```ts
      * // Fetch zero or more SecurityLogs
      * const securityLogs = await prisma.securityLog.findMany()
      * ```
      */
    get securityLog(): Prisma.SecurityLogDelegate<ExtArgs, {
        omit: OmitOpts;
    }>;
}
export declare function getPrismaClientClass(): PrismaClientConstructor;
//# sourceMappingURL=class.d.ts.map