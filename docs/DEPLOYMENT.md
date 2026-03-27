# Deployment Guide

## Railway Setup

1. Create Railway project
2. Add PostgreSQL service
3. Add Node.js service from GitHub repo
4. Set environment variables (see [ENVIRONMENT.md](ENVIRONMENT.md))
5. Deploy triggers automatically on push to master

## Build Process

Railway executes (from package.json):
1. `npm install`
2. `npx prisma db push --accept-data-loss`
3. `npx prisma generate`
4. `npm run build` (TypeScript compilation)
5. `npm start`

## Rollback

### Quick rollback (Railway UI):
1. Go to Railway dashboard > Deployments
2. Find last working deployment
3. Click "Redeploy"

### Git rollback:
```bash
git revert HEAD
git push
```

## Backup

### Manual (via bot):
Send `/backup` or press "🗄️ Бэкап сейчас" in Техработы menu.

### Manual (CLI):
```bash
npm run backup
```

### Restore:
```bash
npm run restore backup-YYYY-MM-DD.json --force
```

## Health Check

GET /health returns 200 if DB is connected, 503 otherwise.

## Monitoring

- **Sentry**: errors tracked if SENTRY_DSN is set
- **Logs**: structured JSON via pino (Railway captures stdout)
- **Bot**: /sync for manual Google Sheets sync trigger

## Database Migrations

After schema changes in `prisma/schema.prisma`:
```bash
npx prisma db push
npx prisma generate
```

Railway runs these automatically during build.
