# Bug Reports: Race Conditions, Async Issues, and Code Quality

> Documentation-only. No code changes in this report.
> Generated: 2026-03-12

---

## Section 1 — Race Conditions & Atomicity

---

### Bug 1.1 — Order Creation TOCTOU Race Condition

**File:** `api/server.ts`, lines 562–611
**Severity:** High

#### Description

The order creation sequence performs three separate database operations without any synchronisation:

1. **Line 563** — `prisma.productVariant.findUnique(...)` reads the current stock and checks `variant.quantity < item.quantity`.
2. **Line 593** — `prisma.order.create(...)` persists the order.
3. **Line 609** — `stockOut(item.variantId, item.quantity, ...)` decrements the stock.

No transaction or row-level lock wraps these three steps. Between steps 1 and 3, any number of concurrent requests can read the same pre-decrement stock value and all pass the availability check.

#### Impact

Two (or more) concurrent checkout requests for the same variant with `quantity = 1` will both pass the `variant.quantity < item.quantity` guard at line 568, both create orders at line 593, and both call `stockOut` at line 609. The result is fulfilled orders against insufficient stock — `quantity` goes negative and the `stockOut` guard in `lib/stock.ts` is the only (also racy) defence.

#### Recommended Fix

Wrap the full sequence — stock check, order creation, and stock decrement — in a single Prisma **interactive transaction** (`prisma.$transaction(async (tx) => { ... })`). Inside the transaction, use a raw `SELECT ... FOR UPDATE` on the variant row to acquire a row-level lock before reading the quantity. Alternatively, replace the separate check+decrement with a single `updateMany` that includes `where: { quantity: { gte: item.quantity } }` and verify the `count` returned equals the number of items; roll back the order creation if any count is zero.

---

### Bug 1.2 — `stockOut` Lacks Row-Level Locking

**File:** `lib/stock.ts`, lines 22–42
**Severity:** High

#### Description

`stockOut` performs the following sequence:

1. **Line 28** — `prisma.productVariant.findUnique(...)` — plain read, no `FOR UPDATE` lock.
2. **Line 29** — Guard: `if (!variant || variant.quantity < qty) throw ...`.
3. **Lines 30–41** — `prisma.$transaction([...])` — a **batch transaction** (array form), not an interactive transaction. Prisma sends these as a single multi-statement transaction, but the guard check at step 2 happens *outside* the transaction scope with no lock held.

#### Impact

Two concurrent calls to `stockOut` with `qty = 1` on a variant with `quantity = 1` will both read `quantity = 1` at line 28, both pass the guard at line 29, and both execute the decrement. The result is `quantity = -1` and an `inStock = false` flag (correct) but with a negative balance that corrupts reporting and stock-movement history.

#### Recommended Fix

Rewrite `stockOut` as an **interactive transaction** (`prisma.$transaction(async (tx) => { ... })`). Acquire a row-level lock with `tx.$queryRaw\`SELECT id FROM "ProductVariant" WHERE id = ${variantId} FOR UPDATE\`` before reading quantity. Re-read the variant inside the transaction after the lock is held, then apply the guard and decrement atomically. Alternatively, skip the guard entirely and use `tx.productVariant.updateMany({ where: { id: variantId, quantity: { gte: qty } }, data: { ... } })`, checking that `count === 1`; if not, throw "Недостаточно товара".

---

### Bug 1.3 — Stale `inStock` Flag Calculation

**File:** `lib/stock.ts`, line 35
**Severity:** Medium

#### Description

Inside the batch transaction at line 30, the `inStock` flag is computed as:

```typescript
inStock: variant.quantity - qty > 0,
```

`variant` is the object fetched at **line 28**, *before* the transaction begins. Under concurrent execution, another `stockOut` or `stockIn` call can modify `quantity` between line 28 and line 30. The `inStock` value written to the database reflects a stale snapshot of `quantity`, not the post-decrement truth.

#### Impact

A variant with `quantity = 1` being decremented by two concurrent calls: one call could write `inStock: true` (`1 - 1 > 0 = false` — actually correct in isolation, but the race with 1.2 means the decrement itself is wrong). More practically, once Bug 1.2 is fixed with an interactive transaction, this calculation must also move inside the transaction to read the locked, current quantity.

As a standalone issue, `inStock` can be set to `true` when the actual post-decrement quantity (as stored) is `0` or below, leading the storefront to display items as available when they are not.

#### Recommended Fix

Compute `inStock` inside the interactive transaction after the decrement, using the locked quantity value:

```typescript
const newQuantity = variant.quantity - qty;   // variant read under FOR UPDATE
await tx.productVariant.update({
  where: { id: variantId },
  data: { quantity: { decrement: qty }, inStock: newQuantity > 0 },
});
```

Alternatively, express it as a raw SQL expression so the database computes the flag atomically: `SET quantity = quantity - $qty, "inStock" = (quantity - $qty > 0)`.

---

### Bug 1.4 — Non-Atomic Reservation Creation

**File:** `bot/admin/sales.ts`, lines 325–333 and 571–587
**Severity:** High

#### Description

Two code paths create a reservation with two separate, unguarded operations:

**Path A (`res:confirm`, lines 325–333):**
```typescript
await prisma.reservation.create({ ... })          // line 325
await prisma.product.update({                      // line 330
  data: { reserved: { increment: qty } },
})
```

**Path B (`res_nc:confirm`, lines 571–587):**
```typescript
await prisma.reservation.create({ ... }).catch(() => { ... })  // line 571
await prisma.product.update({                                   // line 584
  data: { reserved: { increment: qty } },
})
```

Neither path wraps the two operations in a `prisma.$transaction`. There is also no check that `product.quantity - product.reserved >= qty` before incrementing `reserved`.

#### Impact

Two concurrent admin confirmations for the same product will both increment `reserved` independently. The `reserved` counter can exceed `quantity`, making `available = quantity - reserved` negative. This silently allows over-reservation without any error being surfaced to the admin.

#### Recommended Fix

Wrap both operations in `prisma.$transaction`. Inside the transaction, re-read the product with a row-level lock (or use `updateMany` with a `where` condition), verify `quantity - reserved >= qty`, and only then create the reservation and increment `reserved`. If insufficient stock, throw and surface the error to the admin.

---

### Bug 1.5 — Missing Stock Check in `reserve_nc` Flow

**File:** `bot/admin/sales.ts`, lines 773–790
**Severity:** Medium

#### Description

In the `reserve_nc` (reserve without client) flow, the quantity step at line 774 validates only:

```typescript
if (isNaN(qty) || qty <= 0) { ... }
```

No check is made against the available stock (`product.quantity - product.reserved`). Compare with the `reserve` flow at lines 630–634, which explicitly checks availability:

```typescript
const product = await prisma.product.findUnique({ where: { id: productId } })
const available = (product?.quantity ?? 0) - (product?.reserved ?? 0)
if (qty > available) {
  await ctx.reply(`Недостаточно товара. Доступно: ${available} шт.`)
  return true
}
```

The `reserve_nc` flow does display `available` on the previous step (line 769) but does not enforce it.

#### Impact

An admin can enter any positive quantity in the `reserve_nc` flow and it will be accepted, incrementing `reserved` beyond `quantity` and creating a phantom reservation with no stock backing it.

#### Recommended Fix

Add the same availability check as lines 630–634 at the beginning of the `qty` step handler in the `reserve_nc` flow (around line 774), re-reading the product from the database and comparing `qty > product.quantity - product.reserved`.

---

## Section 2 — Stock Balance & Reserve Leaks

---

### Bug 2.1 — Reserved Counter Never Decremented

**File:** `bot/admin/sales.ts`, lines 332 and 586
**Severity:** High

#### Description

The `reserved` field on `Product` is incremented in two places:

- **Line 332** (`res:confirm`): `reserved: { increment: qty }`
- **Line 586** (`res_nc:confirm`): `reserved: { increment: qty }`

A grep of the entire codebase for `reserved: { decrement` returns zero results. There is no code path that decrements `reserved` when a reservation is fulfilled, cancelled, or converted to a sale.

#### Impact

`product.reserved` is a monotonically increasing counter. Over time, `available = product.quantity - product.reserved` approaches zero and eventually goes negative for any actively-sold product, even when stock is plentiful. Admins and the storefront will see incorrect availability figures, and availability checks in the `reserve` flow (lines 630–634) will incorrectly reject valid reservations.

#### Recommended Fix

Add `reserved: { decrement: qty }` to the product update in three places:

1. **On reservation fulfilled** — when a sale is confirmed that corresponds to an active reservation, update `Reservation.status = 'completed'` and decrement `product.reserved`.
2. **On reservation cancelled** — when a `Reservation` record transitions to `status = 'cancelled'`, add `product.update({ data: { reserved: { decrement: reservation.quantity } } })` (inside a transaction).
3. **On sale confirmation without explicit reservation** — see Bug 2.2 for the specific location.

---

### Bug 2.2 — Missing Reserve Decrement on Sale

**File:** `bot/admin/sales.ts`, lines 290–310
**Severity:** High

#### Description

The `sale:confirm` action handler (lines 290–310) calls `stockOut` to decrement `product_variant.quantity` but does not:

- Set the corresponding `Reservation.status` to `'completed'`.
- Decrement `product.reserved` by `qty`.

The handler at line 281 calls `stockOut(saleVariant.id, qty, ...)` which correctly reduces physical stock. However, if the sale fulfils a previously-created reservation (the common workflow), the reservation record remains `active` and `product.reserved` remains inflated indefinitely.

#### Impact

After a sale is confirmed:
- `product.quantity` is correctly decremented.
- `product.reserved` is NOT decremented.

The delta `product.quantity - product.reserved` shrinks with every sale, eventually going negative. Stock appears unavailable to admins and the reservation flow rejects new reservations even when physical stock exists.

#### Recommended Fix

In the `sale:confirm` handler, after calling `stockOut`, check for an active reservation for the same `clientId` + `productId` combination. If found:

```typescript
await prisma.$transaction([
  prisma.reservation.updateMany({
    where: { clientId, productId, status: 'active' },
    data: { status: 'completed' },
  }),
  prisma.product.update({
    where: { id: productId },
    data: { reserved: { decrement: qty } },
  }),
])
```

If no reservation exists (walk-in sale), still ensure `reserved` is not decremented below zero (use `Math.max(0, current - qty)` or a `where: { reserved: { gte: qty } }` guard).

---

## Section 3 — Async/Await & Promise Handling

---

### Bug 3.1 — Unawaited Returns Escaping Try/Catch

**File:** `webhooks/telegram.ts`, lines 226–239, 477, 525–535
**Severity:** Medium

#### Description

Several locations inside `try/catch` blocks use bare `return expr` where `expr` is a `Promise`. The returned promise is not awaited by the caller:

- **Line 226–239** (`case 'edit'`): `return (ctx.telegram.sendMessage as any)(...)` — the promise is returned, not awaited.
- **Line 477**: `return ctx.reply(...)` inside an `if` inside a `try` block.
- **Lines 525–528**: `return startSaleFlow(ctx as Context, clientId)` — `startSaleFlow` is `async`.
- **Lines 534–535**: `return startReserveFlow(ctx as Context, clientId)` — same pattern.

TypeScript allows `return asyncFn()` inside an `async` function — the caller receives the resolved value. However, within a `try/catch`, `return promise` means the `catch` block will *not* catch rejections from that promise. The rejection propagates to the outer caller unwrapped.

#### Impact

If `sendMessage`, `ctx.reply`, `startSaleFlow`, or `startReserveFlow` reject (e.g., Telegram API error, bot blocked, network failure), the rejection escapes the local `try/catch`. It becomes an unhandled promise rejection in the Telegraf middleware chain, which may crash the process depending on Node.js version and Telegraf's error handling configuration.

#### Recommended Fix

Change each `return asyncFn(...)` inside a `try/catch` to `return await asyncFn(...)`. This ensures the promise is settled before the `return` completes, and any rejection is caught by the enclosing `catch` block:

```typescript
// Before
return ctx.telegram.sendMessage(managerId, '...', { ... })

// After
return await ctx.telegram.sendMessage(managerId, '...', { ... })
```

Apply this change at lines 226, 477, 525, and 534–535.

---

### Bug 3.2 — Silent Error Swallowing on Order Link

**File:** `webhooks/telegram.ts`, line 1106
**Severity:** Low

#### Description

The order-to-client linkage update uses a completely silent catch:

```typescript
await prisma.order.update({
  where: { id: orderId },
  data: { clientId: client.id },
}).catch(() => {})
```

All errors — including database connectivity failures, "record not found" (P2025) when the API and webhook race to process the same order, and constraint violations — are silently discarded with no logging.

#### Impact

When this update fails, the order remains unlinked from the client. Admins see no error. The failure produces no entry in logs, making it impossible to diagnose whether the issue is a race condition, a missing record, or a database problem. Customer service and CRM views will show incomplete order history for affected clients.

#### Recommended Fix

At minimum, log the error before swallowing it:

```typescript
.catch((err) => console.error('[Order link failed] orderId=%d clientId=%d', orderId, client.id, err))
```

For recoverable races (Prisma error code `P2025` — record not found), the silent swallow may be acceptable if the order was created by the API concurrently; log it at `warn` level rather than `error` in that case and re-throw for other error types.

---

### Bug 3.3 — Scheduler Ignores Async Rejections

**File:** `bot/scheduler.ts`, line 28
**Severity:** Low

#### Description

The scheduler is started with:

```typescript
setInterval(() => runTick(bot), INTERVAL_MS)
```

`runTick` is an `async` function returning a `Promise<void>`. `setInterval`'s callback return value is discarded — the promise returned by `runTick(bot)` is never observed. `runTick` does wrap its body in a `try/catch` (lines 34–60), but any rejection thrown *before* the internal `try` (e.g., during function prelude, if such code is added later) or from a re-thrown error will become an unhandled rejection.

#### Impact

An unhandled rejection from `runTick` silently exits the scheduler tick with no log entry and no retry. In Node.js ≥ 15, unhandled rejections terminate the process. The scheduler would stop executing future ticks until the process is restarted.

#### Recommended Fix

Attach a `.catch` handler to the promise returned by `runTick`:

```typescript
setInterval(() => {
  runTick(bot).catch(err => console.error('[Scheduler] Unhandled rejection in runTick:', err))
}, INTERVAL_MS)
```

This preserves the existing internal error handling while also catching any unexpected rejections that escape the internal `try/catch`.

---

### Bug 3.4 — Failed Tasks Retry Forever

**File:** `bot/scheduler.ts`, lines 49–56
**Severity:** Medium

#### Description

When `executeTask` throws, the scheduler logs the error and leaves the task in `status = 'pending'`:

```typescript
} catch (err) {
  console.error(`[Scheduler] Задача #${task.id} завершилась с ошибкой:`, err)
  // Не меняем статус — задача останется pending до следующего тика
}
```

There is no retry cap, no backoff, and no terminal failure state. A task that fails permanently (e.g., the client has blocked the bot, the `externalId` is invalid, the Telegram API returns a permanent 403) will be retried every 10 minutes indefinitely.

#### Impact

- The scheduler processes the same broken task on every tick forever, consuming database query budget and Telegram API rate limit quota.
- Permanently-failing tasks accumulate if new ones are created, eventually dominating each tick.
- Operators have no visibility into which tasks are stuck — the only signal is repeated log lines.

#### Recommended Fix

Add a `retryCount` integer field and a `failedAt` timestamp to the `Task` model. On each failure, increment `retryCount`. After `N` retries (e.g., 3), set `status = 'failed'` so the task is excluded from future ticks:

```typescript
} catch (err) {
  console.error(`[Scheduler] Задача #${task.id} завершилась с ошибкой:`, err)
  const nextCount = (task.retryCount ?? 0) + 1
  await prisma.task.update({
    where: { id: task.id },
    data: {
      retryCount: nextCount,
      ...(nextCount >= 3 ? { status: 'failed', failedAt: new Date() } : {}),
    },
  })
}
```

Alternatively, use an `errorMessage` field to record the last error string, enabling admin review without a schema change to the status enum.

---

## Section 4 — Type Conversion & Precision

---

### Bug 4.1 — Decimal-to-Float Precision Loss

**File:** `api/server.ts`, lines 574–575
**Severity:** Medium

#### Description

Prisma returns `price` as a `Decimal` object (from `@prisma/client`). At line 574, it is converted to a JavaScript `number`:

```typescript
const actualPrice = Number(variant.price)   // line 574
totalAmount += actualPrice * item.quantity  // line 575
```

`Number(decimal)` produces an IEEE 754 double-precision float. Subsequent arithmetic — multiplication by `item.quantity` and accumulation into `totalAmount` across multiple loop iterations — is performed entirely in floating-point.

#### Impact

IEEE 754 arithmetic cannot represent most decimal fractions exactly. Classic example: `0.1 + 0.2 === 0.30000000000000004`, not `0.3`. For prices stored as exact decimals (e.g., `999.99`, `1234.50`), floating-point arithmetic introduces rounding errors that accumulate across line items. The `totalAmount` written to the order record and charged to the customer may differ from the correct sum by a few kopecks (or more for large orders), causing financial discrepancies between the order total, payment processor charge, and accounting records.

#### Recommended Fix

Perform all monetary arithmetic in exact decimal arithmetic. Options:

1. **Use Prisma's `Decimal` methods directly** — `variant.price` is a `Prisma.Decimal`; use `variant.price.times(item.quantity)` and `totalDecimal = totalDecimal.plus(lineTotal)` throughout.
2. **Use `decimal.js`** (already a transitive dependency via Prisma): `new Decimal(variant.price).times(item.quantity)`.
3. **Work in integer kopecks** — store and compute prices as integers (kopecks), convert to rubles only for display: `const priceKopecks = BigInt(variant.priceKopecks); totalKopecks += priceKopecks * BigInt(item.quantity)`.

Convert to string for storage only at the end: `totalAmount: totalDecimal.toFixed(2)`.

---

## Section 5 — Unhandled Message Types & Webhook Gaps

---

### Bug 5.1 — Client Non-Text Messages Silently Dropped

**File:** `webhooks/telegram.ts`, lines 709–718
**Severity:** Medium

#### Description

The client message handler reads:

```typescript
const text = rawMsg['text'] as string | undefined
if (text) {
  try {
    await handleClientMessage(ctx.telegram, from, text)
  } catch (err) { ... }
}
```

Non-text messages (photo, voice, sticker, video, document, location, etc.) produce `text = undefined`. The `if (text)` branch is skipped. There is no `else` branch, no `next()` call, and no acknowledgment to the client.

#### Impact

A client sending a photo of a product, a voice message, or any media type receives no response and no indication that their message was received. From the client's perspective, the message disappeared. The admin CRM topic also receives no relay of the media. This silently degrades the customer experience for any non-text interaction.

#### Recommended Fix

Handle non-text messages in one of two ways:

1. **Relay to CRM topic** — detect media types and forward them to the client's CRM topic thread, mirroring the behaviour of text messages.
2. **Acknowledge to client** — if media relay is not yet implemented, reply to the client: `"Пожалуйста, пишите текстом — медиафайлы пока не обрабатываются."` This at minimum prevents silent drops.

At minimum, add an `else` branch that logs the unhandled message type and continues processing.

---

### Bug 5.2 — Admin Media Replies Not Forwarded

**File:** `webhooks/telegram.ts`, lines 676–690
**Severity:** Medium

#### Description

The CRM-group message handler guards forwarding with:

```typescript
if (threadId != null && text) {
  await handleManagerReply(ctx as Context, threadId, text, from.id, messageId)
}
```

The condition `&& text` means the block is entered only when the admin's message contains a text body. Admin messages that are photos, videos, documents, or voice notes — with no text caption, or with a caption but `text` field absent — are silently dropped. The `return` on line 690 exits the handler without forwarding.

#### Impact

An admin posting a product photo, a shipping label scan, or a document to a client's CRM topic thread will see no error but the client will never receive the media. This is particularly harmful in commerce workflows where photo evidence (delivery confirmation, product images) is routinely exchanged.

#### Recommended Fix

Extend `handleManagerReply` to accept media context, or add a parallel code path that checks for `photo`, `video`, `document`, `voice`, and `sticker` fields in `rawMsg` and forwards them using `ctx.telegram.copyMessage(clientChatId, CRM_GROUP_ID, messageId)`. This API call forwards any message type by message ID without re-uploading. As an interim measure, document in the admin UI that only text replies are relayed to clients.

---

### Bug 5.3 — Non-Null Assertion Crash Risk

**File:** `webhooks/telegram.ts`, line 1115
**Severity:** Medium

#### Description

After calling `createClientTopic`, the client record is re-fetched with a non-null assertion:

```typescript
client = (await prisma.client.findUnique({
  where: { id: client.id },
  include: { segment: true },
}))!
```

The `!` operator tells TypeScript to treat the result as non-null without any runtime check. `prisma.client.findUnique` returns `null` when no record matches, which TypeScript `!` simply ignores at runtime.

#### Impact

If the client record is deleted between creation (line 1097) and this re-fetch — for example by a concurrent admin action, a database cleanup script, or a cascading delete — `client` will be `null` at runtime despite TypeScript believing it cannot be. Any subsequent property access (`client.telegramTopicId`, `client.name`, etc.) on lines 1119+ will throw `TypeError: Cannot read properties of null (reading 'telegramTopicId')`, crashing the webhook handler for this request with an unhandled exception.

#### Recommended Fix

Replace the non-null assertion with an explicit null guard:

```typescript
const refreshed = await prisma.client.findUnique({
  where: { id: client.id },
  include: { segment: true },
})
if (!refreshed) {
  console.error('[handleNewOrder] Client %d vanished after createClientTopic', client.id)
  return
}
client = refreshed
```

---

## Section 6 — Minor Issues & Code Quality

---

### Bug 6.1 — Redundant Database Fetches After Stock Operations

**File:** `bot/admin/inventory.ts`, lines 2897–2905 and 2951–2958
**Severity:** Low

#### Description

In both the `stockIn` and `stockOut` comment-step handlers, the variant is fetched from the database twice in immediate succession with no writes between the fetches:

**`stockIn` flow (lines 2897–2905):**
```typescript
await stockIn(state.variantId, state.qty, comment, String(userId))
const updated = await prisma.productVariant.findUnique({ where: { id: state.variantId } })
// ... reply using updated.quantity ...
const variant = await prisma.productVariant.findUnique({ where: { id: state.variantId } })  // line 2904
if (variant) await showStockProduct(ctx, variant.productId)                                   // line 2905
```

**`stockOut` flow (lines 2950–2958):**
```typescript
await stockOut(state.variantId, state.qty, comment, String(userId))
const updated = await prisma.productVariant.findUnique({ where: { id: state.variantId } })  // line 2951
// ... reply using updated.quantity ...
const variant = await prisma.productVariant.findUnique({ where: { id: state.variantId } })  // line 2957
if (variant) await showStockProduct(ctx, variant.productId)                                   // line 2958
```

`updated` and `variant` fetch the same record from the same table with the same `where` clause and no intervening mutation. The second fetch is entirely redundant.

#### Impact

Each stock operation issues one unnecessary database round-trip. While the performance impact is small in isolation, it represents a pattern of wasteful queries that will accumulate under load and adds latency visible to the admin performing the operation.

#### Recommended Fix

Remove the second fetch and reuse the `updated` variable:

```typescript
// stockIn flow
const updated = await prisma.productVariant.findUnique({ where: { id: state.variantId } })
await ctx.reply(`✅ Приход ${state.qty} шт. записан. Новый остаток: ${updated?.quantity ?? '?'} шт.`, ...)
if (updated) await showStockProduct(ctx, updated.productId)
```

Apply the same simplification to the `stockOut` flow.

---

### Bug 6.2 — Scheduler Tick Overlap Risk

**File:** `bot/scheduler.ts`, line 28
**Severity:** Low

#### Description

The scheduler uses `setInterval` with a fixed 10-minute interval:

```typescript
setInterval(() => runTick(bot), INTERVAL_MS)
```

`setInterval` fires every `INTERVAL_MS` milliseconds regardless of whether the previous invocation has completed. `runTick` is `async` and involves database queries and Telegram API calls. If `runTick` takes longer than 10 minutes (e.g., processing a large task batch with Telegram rate-limiting delays), a new tick starts while the previous tick is still running.

#### Impact

Overlapping ticks query the same `pending` tasks simultaneously. Because task status is updated to `done` only after `executeTask` completes, both ticks find the same tasks in `pending` state and both execute them. This produces duplicate messages sent to clients, duplicate stock movements, and duplicate `promo_notify` broadcasts — all without any error being raised.

#### Recommended Fix

Add a mutex flag that prevents re-entrant execution:

```typescript
let isRunning = false

async function runTick(bot: Telegraf): Promise<void> {
  if (isRunning) {
    console.warn('[Scheduler] Tick skipped — previous tick still running')
    return
  }
  isRunning = true
  try {
    // ... existing body ...
  } finally {
    isRunning = false  // always reset, even on error
  }
}
```

The `try/finally` guarantees the flag is reset even if `runTick` throws, preventing a permanent lock-out.
