import * as Sentry from '@sentry/node'

const DSN = process.env.SENTRY_DSN

export function initSentry() {
  if (!DSN) return

  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.data) {
        const data = event.request.data as Record<string, any>
        if (data.customerPhone) data.customerPhone = '***'
        if (data.customerName) data.customerName = '***'
        if (data.deliveryAddress) data.deliveryAddress = '***'
      }
      return event
    },
  })
}

export { Sentry }
