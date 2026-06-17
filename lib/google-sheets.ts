/**
 * lib/google-sheets.ts — Google Sheets API клиент
 *
 * Чтение и запись в Google таблицу через сервисный аккаунт.
 */

import fs from 'fs'
import { google, sheets_v4 } from 'googleapis'

const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? ''
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

/**
 * В `.env` внутри `private_key` часто оказываются настоящие переводы строк (U+000A)
 * вместо JSON-escape `\n`, либо последовательность «\\» + реальный LF — JSON.parse падает.
 */
function fixPrivateKeyNewlinesInInlineJson(s: string): string {
  const begin = '-----BEGIN PRIVATE KEY-----'
  const end = '-----END PRIVATE KEY-----'
  const i0 = s.indexOf(begin)
  const i1 = s.indexOf(end)
  if (i0 < 0 || i1 < 0 || i1 <= i0) return s
  const head = s.slice(0, i0 + begin.length)
  const mid = s.slice(i0 + begin.length, i1)
  const tail = s.slice(i1)
  let m = mid.replace(/\\\r?\n/g, '\\n')
  m = m.replace(/\r\n/g, '\\n').replace(/\r/g, '\\n').replace(/\n/g, '\\n')
  /** После конца PEM: «-----END … -----» затем необязательный «\», реальный LF и закрывающая кавычка строки JSON */
  const tailFixed = tail.replace(/^(-----END PRIVATE KEY-----)(?:\\)?\r?\n"/, '$1\\n"')
  return head + m + tailFixed
}

/** Нормализует сырую строку учётки из `.env`: типичный дребезг PEM и экранирования. */
export function buildInlineGoogleServiceAccountJsonVariants(rawKeyJson: string): string[] {
  const trim = rawKeyJson.replace(/^\uFEFF/, '').trim().replace(/\r/g, '')
  /** Некоторые редакторы вставили в PEM вместо перевода строки литералы «\xa» (невалидный JSON escape). */
  const fixPemNl = trim
    .replace(/(-----BEGIN PRIVATE KEY-----)\\xa/gi, '$1\\n')
    .replace(/(-----BEGIN PRIVATE KEY-----)\\\\xa/gi, '$1\\n')
    .replace(/(-----BEGIN PRIVATE KEY-----)\\x(?=[A-Za-z0-9+/=])/gi, '$1\\n')
  /** После `{` лишний обратный слэш: `{  \"type\":` → `{\"type\":` */
  const fixLeadBrace = trim.replace(/^(\{\s+)\s*\\+"/, '$1"')
  const fixLeadBracePem = fixPemNl.replace(/^(\{\s+)\s*\\+"/, '$1"')
  /** В .env вложенность полей сохранена как `\"key\"` вместо `"key"`. */
  const unescapeQuotes = (s: string) => s.replace(/\\"/g, '"')

  const chain = (s: string) => fixPrivateKeyNewlinesInInlineJson(unescapeQuotes(s))

  return [
    ...new Set(
      [
        trim,
        fixPemNl,
        fixLeadBrace,
        fixLeadBracePem,
        unescapeQuotes(trim),
        unescapeQuotes(fixPemNl),
        unescapeQuotes(fixLeadBrace),
        unescapeQuotes(fixLeadBracePem),
        chain(trim),
        chain(fixPemNl),
        chain(fixLeadBrace),
        chain(fixLeadBracePem),
      ].filter(Boolean),
    ),
  ]
}

function getAuth() {
  // Приоритет — путь к JSON-файлу (надёжно работает локально, без проблем с
  // dotenv-экранированием private_key). На Railway переменная задана как
  // сырая JSON-строка → попадаем во вторую ветку.
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
  if (keyFile) {
    if (!fs.existsSync(keyFile)) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY_FILE points to missing file: ${keyFile}`)
    }
    return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES })
  }

  // Стандарт gcloud/ACTIONS: переменная на JSON-файл (без вставки ключа в .env).
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (gac && fs.existsSync(gac)) {
    return new google.auth.GoogleAuth({ keyFile: gac, scopes: SCOPES })
  }

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY (or _KEY_FILE) not set')

  // В .env JSON часто порчен: PEM с невалидным escape «\xa» вместо «\n»; кавычки как \".
  // Пробуем цепочку вариантов до первого успешного JSON.parse.
  let key: Record<string, unknown> | undefined
  const variants = buildInlineGoogleServiceAccountJsonVariants(keyJson)
  let lastErr: unknown
  let parsedOk = false
  for (const v of variants) {
    try {
      key = JSON.parse(v) as Record<string, unknown>
      parsedOk = true
      break
    } catch (e) {
      lastErr = e
    }
  }
  if (!parsedOk || key === undefined) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}. ` +
        'Положи ключ в JSON-файл и задай GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./path/to/key.json — так не зависит от экранирования в .env.',
    )
  }
  return new google.auth.GoogleAuth({ credentials: key, scopes: SCOPES })
}

let sheetsClient: sheets_v4.Sheets | null = null

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (!sheetsClient) {
    const auth = getAuth()
    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

async function withSheetsRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (i === retries - 1) throw err
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rateLimitExceeded')) {
        await new Promise(r => setTimeout(r, (i + 1) * 2000))
        continue
      }
      throw err
    }
  }
  throw new Error('Sheets retry exhausted')
}

/**
 * Прочитать все строки с листа.
 * Возвращает массив строк (каждая строка — массив значений ячеек).
 */
export async function readSheet(sheetName: string): Promise<string[][]> {
  return withSheetsRetry(async () => {
    const sheets = await getSheets()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!A1:Z`,
    })
    return (res.data.values ?? []) as string[][]
  })
}

/**
 * Записать значение в конкретную ячейку.
 */
export async function writeCell(sheetName: string, cell: string, value: string | number): Promise<void> {
  const sheets = await getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!${cell}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  })
}

/**
 * Записать диапазон значений.
 */
export async function writeRange(sheetName: string, range: string, values: (string | number)[][]): Promise<void> {
  return withSheetsRetry(async () => {
    const sheets = await getSheets()
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!${range}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    })
  })
}

/**
 * Добавить строки в конец листа.
 */
export async function appendRows(sheetName: string, values: (string | number)[][]): Promise<void> {
  const sheets = await getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

/**
 * Batch update: записать несколько диапазонов за один API-вызов.
 */
export async function batchUpdate(data: { range: string; values: (string | number)[][] }[]): Promise<void> {
  if (data.length === 0) return
  return withSheetsRetry(async () => {
    const sheets = await getSheets()
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: data.map(d => ({ range: d.range, values: d.values })),
      },
    })
  })
}

/**
 * Получить список всех листов в таблице.
 */
export async function getSheetNames(): Promise<string[]> {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties.title',
  })
  return (res.data.sheets ?? []).map(s => s.properties?.title ?? '').filter(Boolean)
}

/**
 * Служебные листы, которые товарный учёт игнорирует при полистовом парсинге.
 * По умолчанию исключаются все листы, чьё имя начинается с «не использовать»
 * (в т.ч. «не использовать 2»). Дополнительные имена — через EXCLUDED_SHEET_NAMES
 * (список через запятую). Сравнение регистронезависимое.
 */
function getExcludedSheetPrefix(): string {
  return (process.env.EXCLUDED_SHEET_PREFIX ?? 'не использовать').trim().toLowerCase()
}

function getExcludedSheetNames(): string[] {
  return (process.env.EXCLUDED_SHEET_NAMES ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/** true, если лист служебный и его нужно пропустить при синхронизации товаров. */
export function isExcludedSheet(name: string): boolean {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return true
  const prefix = getExcludedSheetPrefix()
  if (prefix && n.startsWith(prefix)) return true
  return getExcludedSheetNames().includes(n)
}

/**
 * Листы с товарами для полистового товарного учёта: все листы таблицы,
 * кроме служебных (см. {@link isExcludedSheet}).
 */
export async function getProductSheetNames(): Promise<string[]> {
  const all = await getSheetNames()
  return all.filter(name => name && !isExcludedSheet(name))
}

/**
 * Создать новый лист если не существует.
 */
export async function createSheetIfNotExists(sheetName: string): Promise<void> {
  const existing = await getSheetNames()
  if (existing.includes(sheetName)) return

  const sheets = await getSheets()
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        addSheet: { properties: { title: sheetName } },
      }],
    },
  })
}
