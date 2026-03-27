import type { InputJsonValue } from '@prisma/client/runtime/client'
import { prisma } from './prisma'
import log from './logger'

interface TrackParams {
  type: string
  clientId?: number
  productId?: number
  data?: Record<string, unknown>
  source?: string
  sessionId?: string
}

/** Fire-and-forget event tracking — never throws, never blocks */
export function trackEvent(params: TrackParams): void {
  prisma.event.create({ data: { ...params, data: params.data as InputJsonValue } }).catch(err => {
    log.debug('Event track failed', { type: params.type, error: err instanceof Error ? err.message : String(err) })
  })
}
