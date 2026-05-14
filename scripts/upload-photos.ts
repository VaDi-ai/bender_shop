/**
 * Upload photos to remote PHOTOS_DIR через `/admin/photos/upload` endpoint.
 *
 * Считает HMAC-подпись от BOT_TOKEN (anti-replay через 5-минутный timestamp)
 * и шлёт zip с готовыми WebP-фотками. Используется как локальный wrapper
 * вокруг curl/fetch — не надо вручную формировать HMAC.
 *
 * Использование:
 *   ts-node scripts/upload-photos.ts <zip_path> [--url=https://bendershop.store]
 *
 * Перед запуском:
 *   - .env должен содержать BOT_TOKEN (тот же что на сервере)
 *   - На сервере должен быть задан PHOTOS_DIR
 *   - На сервере должен быть установлен tar (на Linux/Railway есть из коробки)
 *
 * Подготовка zip из R-final:
 *   PowerShell:
 *     Compress-Archive -Path .\R-final\*.webp -DestinationPath .\photos.zip -Force
 *   bash:
 *     (cd R-final && zip -r ../photos.zip *.webp)
 *
 * Пример:
 *   npm run upload-photos -- ./photos.zip
 *
 * Ответ сервера:
 *   { uploaded: 230, skipped: 0, errors: [], photosDir: '/data/photos' }
 */
import 'dotenv/config'
import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import http from 'http'
import { URL } from 'url'

const DEFAULT_URL = process.env.WEBAPP_URL ?? 'https://bendershop.store'

interface UploadArgs {
  zipPath: string
  baseUrl: string
}

function parseArgs(argv: string[]): UploadArgs | null {
  const positional: string[] = []
  let baseUrl = DEFAULT_URL
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i] ?? ''
    if (a.startsWith('--url=')) baseUrl = a.split('=', 2)[1] ?? baseUrl
    else positional.push(a)
  }
  const zipPath = positional[0]
  if (!zipPath) return null
  return { zipPath, baseUrl }
}

function printUsage(): void {
  console.error('Usage: ts-node scripts/upload-photos.ts <zip_path> [--url=https://bendershop.store]')
  console.error('')
  console.error('Готовит HMAC-подпись от BOT_TOKEN и заливает zip на /admin/photos/upload.')
  console.error('Перед запуском убедись что в .env задан BOT_TOKEN.')
}

function buildAuthHeaders(body: Buffer, botToken: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString()
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const sig = crypto.createHmac('sha256', botToken).update(`${ts}:${bodyHash}`).digest('hex')
  return {
    'x-admin-timestamp': ts,
    'x-admin-signature': sig,
  }
}

interface UploadResponse {
  uploaded?: number
  skipped?: number
  errors?: string[]
  photosDir?: string
  error?: string
}

async function postZip(targetUrl: string, body: Buffer, headers: Record<string, string>): Promise<{ status: number; data: UploadResponse }> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl)
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http
    const req = lib.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': body.length.toString(),
          ...headers,
        },
      },
      (resp) => {
        const chunks: Buffer[] = []
        resp.on('data', (c) => chunks.push(c as Buffer))
        resp.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          let data: UploadResponse
          try {
            data = text ? (JSON.parse(text) as UploadResponse) : {}
          } catch {
            data = { error: `Non-JSON response: ${text.slice(0, 200)}` }
          }
          resolve({ status: resp.statusCode ?? 0, data })
        })
      }
    )
    req.on('error', reject)
    // Долгий upload — таймаут 5 мин
    req.setTimeout(5 * 60 * 1000, () => {
      req.destroy(new Error('Upload timeout (5 min)'))
    })
    req.write(body)
    req.end()
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (!args) {
    printUsage()
    process.exit(1)
  }

  const botToken = process.env.BOT_TOKEN
  if (!botToken) {
    console.error('BOT_TOKEN не задан в .env')
    process.exit(1)
  }

  if (!fs.existsSync(args.zipPath)) {
    console.error(`Zip not found: ${args.zipPath}`)
    process.exit(1)
  }

  const body = fs.readFileSync(args.zipPath)
  const sizeMb = body.length / 1024 / 1024
  console.log(`Uploading ${args.zipPath} (${sizeMb.toFixed(1)} MB) → ${args.baseUrl}/admin/photos/upload`)

  const headers = buildAuthHeaders(body, botToken)
  const targetUrl = args.baseUrl.replace(/\/$/, '') + '/admin/photos/upload'

  try {
    const result = await postZip(targetUrl, body, headers)
    if (result.status >= 200 && result.status < 300) {
      const d = result.data
      console.log('\nOK:')
      console.log(`  uploaded:  ${d.uploaded ?? '?'}`)
      console.log(`  skipped:   ${d.skipped ?? '?'} (mtime >= source)`)
      console.log(`  errors:    ${d.errors?.length ?? 0}`)
      if (d.errors && d.errors.length > 0) {
        for (const e of d.errors.slice(0, 10)) console.log(`    - ${e}`)
        if (d.errors.length > 10) console.log(`    ... and ${d.errors.length - 10} more`)
      }
      console.log(`  photosDir: ${d.photosDir ?? '?'}`)
    } else {
      console.error(`\nHTTP ${result.status}:`)
      console.error(`  ${result.data.error ?? JSON.stringify(result.data)}`)
      process.exit(1)
    }
  } catch (err) {
    console.error(`\nUpload failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
