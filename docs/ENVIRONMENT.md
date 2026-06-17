# Environment Variables

## Required

### Database
| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@host:5432/db |

### Telegram
| Variable | Description | Example |
|----------|-------------|---------|
| BOT_TOKEN | Telegram Bot API token | 123456:ABC-DEF |
| WEBHOOK_URL | Public HTTPS URL for webhooks | https://app.railway.app |
| WEBHOOK_SECRET | Random string for webhook verification | random-secret-string |
| CRM_GROUP_ID | Telegram group ID for CRM topics | -1001234567890 |
| ADMIN_IDS | Comma-separated admin Telegram IDs | 123456789,987654321 |

### AI
| Variable | Description | Example |
|----------|-------------|---------|
| OPENROUTER_API_KEY | OpenRouter API key | sk-or-v1-... |

### Google Sheets
| Variable | Description | Example |
|----------|-------------|---------|
| GOOGLE_SERVICE_ACCOUNT_KEY | JSON string of service account key | {"type":"service_account",...} |
| GOOGLE_SHEET_ID | Google Sheets document ID | 1ABC...xyz |
| EXCLUDED_SHEET_PREFIX | Префикс имён служебных листов (регистронезависимо). По умолчанию «не использовать» — исключает и «не использовать 2». | не использовать |
| EXCLUDED_SHEET_NAMES | Дополнительные служебные листы (через запятую), помимо префикса | архив |

### Encryption
| Variable | Description | Example |
|----------|-------------|---------|
| ENCRYPTION_KEY_V1 | 64-char hex for AES-256-GCM | a1b2c3...64chars |

## Optional

### AI Settings
| Variable | Description | Default |
|----------|-------------|---------|
| AI_MODEL | OpenRouter model ID | anthropic/claude-sonnet-4 |
| AI_MODE | AI agent mode (off/manual/semi/auto) | off |

### Avito
| Variable | Description | Default |
|----------|-------------|---------|
| AVITO_CLIENT_ID | Avito API OAuth client ID | - |
| AVITO_CLIENT_SECRET | Avito API OAuth secret | - |
| AVITO_USER_ID | Avito user/profile ID | - |
| AVITO_ADDRESS | Store address for Avito listings | - |
| AVITO_PHONE | Contact phone for Avito | - |
| AVITO_MANAGER | Manager name for Avito | - |
| AVITO_WEBHOOK_SECRET | Webhook verification secret | - |

### Instagram
| Variable | Description | Default |
|----------|-------------|---------|
| INSTAGRAM_APP_SECRET | Instagram app secret for signature verification | - |
| INSTAGRAM_VERIFY_TOKEN | Webhook verification token | - |

### Monitoring
| Variable | Description | Default |
|----------|-------------|---------|
| SENTRY_DSN | Sentry error tracking DSN | disabled |
| LOG_LEVEL | Pino log level (debug/info/warn/error) | info |

### App
| Variable | Description | Default |
|----------|-------------|---------|
| NODE_ENV | Environment (development/production) | development |
| PORT | HTTP server port | 3000 |
| API_PORT | Alias for PORT | 3000 |
| WEBAPP_URL | Mini App public URL | http://localhost:3000/shop |
| DEFAULT_STOCK_QTY | Default stock quantity when sheet is empty | 3 |
| SHEETS_FULL_RESET | Clear all products before sync (use with caution) | false |
| STOCK_WRITEOFF_ENABLED | Enable automatic stock writeoff on sale | false |
| PHOTOS_DIR | Absolute path to product photos (Railway Volume mount) | public/uploads/products |
