import type { Context } from 'telegraf'

/**
 * Safe user ID extraction from Telegraf context.
 * All admin handlers are behind middleware that guarantees ctx.from exists,
 * but we use safe access to avoid non-null assertions.
 */
export function getUserId(ctx: Context): number {
  const id = ctx.from?.id
  if (!id) throw new Error('getUserId: ctx.from is undefined')
  return id
}
