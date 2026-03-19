/**
 * lib/google-sheets.ts — Google Sheets API клиент
 *
 * Чтение и запись в Google таблицу через сервисный аккаунт.
 */

import { google, sheets_v4 } from 'googleapis'

const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? ''

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set')

  const key = JSON.parse(keyJson)
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

let sheetsClient: sheets_v4.Sheets | null = null

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (!sheetsClient) {
    const auth = getAuth()
    sheetsClient = google.sheets({ version: 'v4', auth })
  }
  return sheetsClient
}

/**
 * Прочитать все строки с листа.
 * Возвращает массив строк (каждая строка — массив значений ячеек).
 */
export async function readSheet(sheetName: string): Promise<string[][]> {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A1:Z`,
  })
  return (res.data.values ?? []) as string[][]
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
  const sheets = await getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
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
