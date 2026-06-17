/**
 * Полный аудит фото каталога: URL из API ↔ файлы на CDN (Foto/ или PHOTOS_DIR).
 *
 *   npx ts-node scripts/audit-product-photos.ts [api_base] [foto_dir] [out_dir]
 *
 * Отчёты в out_dir (по умолчанию reports/photo-audit-<timestamp>/):
 *   summary.json
 *   broken.csv — URL в каталоге, файла нет даже после нормализации пробелов
 *   fixable.csv — URL битый, но есть файл с другим числом пробелов
 *   ok.csv — URL совпадает с CDN
 *   empty-variants.csv — варианты без фото (ожидаемая заглушка)
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'

import {
  buildCdnPhotoIndex,
  cleanPhotoUrl,
  collapseSpaces,
  photoBasenameFromUrl,
  readPhotoFilenamesFromDir,
  resolveCdnPhotoUrl,
} from '../lib/cdn-photo-resolve'

const API_BASE = (process.argv[2] || 'https://bendershop.store').replace(/\/$/, '')
const FOTO_DIR = process.argv[3] || process.env.FOTO_DIR || path.join(process.cwd(), 'Foto')
const OUT_DIR =
  process.argv[4] ||
  path.join(process.cwd(), 'reports', `photo-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)

type Product = {
  id: number
  name: string
  sku?: string
  photoUrl?: string
  photos?: string[]
  variants?: Array<{
    id: number
    sku?: string
    attributes?: Record<string, string>
    photos?: string[]
  }>
}

type Variant = NonNullable<Product['variants']>[number]

type Row = {
  productId: number
  productName: string
  variantId: number | ''
  color: string
  sku: string
  url: string
  basename: string
  status: 'ok' | 'fixable' | 'broken' | 'external' | 'trailing_junk'
  resolvedUrl: string
  cdnFile: string
}

function csvEscape(s: string) {
  return `"${String(s).replace(/"/g, '""')}"`
}

function writeCsv(file: string, rows: Row[]) {
  const header =
    'productId,productName,variantId,color,sku,status,url,resolvedUrl,cdnFile,basename\n'
  const body = rows
    .map(r =>
      [
        r.productId,
        csvEscape(r.productName),
        r.variantId,
        csvEscape(r.color),
        csvEscape(r.sku),
        r.status,
        csvEscape(r.url),
        csvEscape(r.resolvedUrl),
        csvEscape(r.cdnFile),
        csvEscape(r.basename),
      ].join(','),
    )
    .join('\n')
  fs.writeFileSync(file, header + body + (body ? '\n' : ''), 'utf8')
}

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/api/products`)
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Product[]>
}

async function headOk(url: string): Promise<boolean> {
  try {
    const abs = url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`
    const res = await fetch(abs, { method: 'HEAD', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

function isOurCdnUrl(url: string): boolean {
  return /\/photos\//i.test(url) || /^https?:\/\/[^/]*bendershop[^/]*\/photos\//i.test(url)
}

function lookupCdnFile(basename: string, index: ReturnType<typeof buildCdnPhotoIndex>): string {
  if (index.exact.has(basename)) return basename
  const key = collapseSpaces(basename).toLowerCase()
  return index.byCollapsed.get(key) || ''
}

async function main() {
  if (!fs.existsSync(FOTO_DIR)) {
    console.error(`Foto dir not found: ${FOTO_DIR}`)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const filenames = readPhotoFilenamesFromDir(FOTO_DIR)
  const index = buildCdnPhotoIndex(filenames)
  console.log(`CDN index: ${filenames.length} files in ${FOTO_DIR}`)

  const products = await fetchProducts()
  console.log(`Products from API: ${products.length}`)

  const rows: Row[] = []
  const trailingJunk: Row[] = []
  const emptyVariants: Array<{
    productId: number
    productName: string
    variantId: number
    color: string
    sku: string
  }> = []
  const seenUrl = new Set<string>()

  for (const p of products) {
    const collect = (url: string, variant?: Variant) => {
      const raw = String(url || '').trim()
      if (!raw) return
      const u = cleanPhotoUrl(raw)
      const dedupe = `${p.id}|${variant?.id ?? ''}|${u}`
      if (seenUrl.has(dedupe)) return
      seenUrl.add(dedupe)

      if (raw !== u) {
        trailingJunk.push({
          productId: p.id,
          productName: p.name,
          variantId: variant?.id ?? '',
          color: variant?.attributes?.['Цвет'] || variant?.attributes?.['цвет'] || '',
          sku: variant?.sku || p.sku || '',
          url: raw,
          basename: photoBasenameFromUrl(raw) || '',
          status: 'trailing_junk',
          resolvedUrl: u,
          cdnFile: '',
        })
      }

      const color = variant?.attributes?.['Цвет'] || variant?.attributes?.['цвет'] || ''
      const sku = variant?.sku || p.sku || ''
      const basename = photoBasenameFromUrl(u) || ''
      const resolved = resolveCdnPhotoUrl(u, index)
      const cdnFile = basename ? lookupCdnFile(basename, index) : ''

      let status: Row['status']
      if (!isOurCdnUrl(u)) {
        status = 'external'
      } else if (cdnFile && cdnFile === basename) {
        status = 'ok'
      } else if (cdnFile && cdnFile !== basename) {
        status = 'fixable'
      } else {
        status = 'broken'
      }

      rows.push({
        productId: p.id,
        productName: p.name,
        variantId: variant?.id ?? '',
        color,
        sku,
        url: u,
        basename,
        status,
        resolvedUrl: resolved,
        cdnFile,
      })
    }

    if (p.photoUrl) collect(p.photoUrl)
    for (const ph of p.photos ?? []) collect(ph)

    for (const v of p.variants ?? []) {
      const photos = v.photos ?? []
      if (!photos.length) {
        emptyVariants.push({
          productId: p.id,
          productName: p.name,
          variantId: v.id,
          color: v.attributes?.['Цвет'] || v.attributes?.['цвет'] || '',
          sku: v.sku || '',
        })
      }
      for (const ph of photos) collect(ph, v)
    }
  }

  const ok = rows.filter(r => r.status === 'ok')
  const fixable = rows.filter(r => r.status === 'fixable')
  const broken = rows.filter(r => r.status === 'broken')
  const external = rows.filter(r => r.status === 'external')

  // HTTP-проверка уникальных CDN URL (оригинал и resolved)
  const httpCache = new Map<string, boolean>()
  async function checkHttp(url: string): Promise<boolean> {
    if (!url || httpCache.has(url)) return httpCache.get(url)!
    const okHttp = await headOk(url)
    httpCache.set(url, okHttp)
    return okHttp
  }

  const brokenAfterHttp: Row[] = []
  const fixableConfirmed: Row[] = []

  const uniqueChecks = new Set<string>()
  for (const r of [...fixable, ...broken, ...ok.filter(x => isOurCdnUrl(x.url))]) {
    uniqueChecks.add(r.url)
    if (r.resolvedUrl !== r.url) uniqueChecks.add(r.resolvedUrl)
  }

  console.log(`HEAD-checking ${uniqueChecks.size} unique URLs…`)
  let i = 0
  for (const url of uniqueChecks) {
    await checkHttp(url)
    i++
    if (i % 25 === 0) process.stdout.write(`  ${i}/${uniqueChecks.size}\r`)
  }
  console.log(`HEAD-check done (${uniqueChecks.size} URLs)`)

  for (const r of fixable) {
    const origOk = await checkHttp(r.url)
    const fixedOk = r.resolvedUrl !== r.url ? await checkHttp(r.resolvedUrl) : origOk
    if (!origOk && fixedOk) fixableConfirmed.push(r)
    else if (!origOk && !fixedOk) brokenAfterHttp.push({ ...r, status: 'broken' })
    else ok.push(r)
  }

  for (const r of broken) {
    const origOk = await checkHttp(r.url)
    const fixedOk = r.resolvedUrl !== r.url && (await checkHttp(r.resolvedUrl))
    if (!origOk && fixedOk) fixableConfirmed.push(r)
    else if (!origOk) brokenAfterHttp.push(r)
    else ok.push(r)
  }

  const usedBasenames = new Set(rows.map(r => collapseSpaces(r.cdnFile || r.basename).toLowerCase()).filter(Boolean))
  const unusedCdnFiles = filenames.filter(f => !usedBasenames.has(collapseSpaces(f).toLowerCase()))

  const summary = {
    apiBase: API_BASE,
    fotoDir: FOTO_DIR,
    cdnFiles: filenames.length,
    products: products.length,
    urlRows: rows.length,
    uniqueUrls: uniqueChecks.size,
    ok: ok.length,
    fixableSpacing: fixableConfirmed.length,
    broken: brokenAfterHttp.length,
    external: external.length,
    trailingJunk: trailingJunk.length,
    unusedCdnFiles: unusedCdnFiles.length,
    emptyVariants: emptyVariants.length,
    ambiguousCollapsedKeys: [...index.ambiguous.entries()].map(([k, files]) => ({ key: k, files })),
  }

  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
  writeCsv(path.join(OUT_DIR, 'ok.csv'), ok)
  writeCsv(path.join(OUT_DIR, 'fixable.csv'), fixableConfirmed)
  writeCsv(path.join(OUT_DIR, 'broken.csv'), brokenAfterHttp)
  writeCsv(path.join(OUT_DIR, 'trailing-junk.csv'), trailingJunk)
  fs.writeFileSync(
    path.join(OUT_DIR, 'unused-cdn-files.txt'),
    unusedCdnFiles.join('\n') + (unusedCdnFiles.length ? '\n' : ''),
    'utf8',
  )
  writeCsv(
    path.join(OUT_DIR, 'empty-variants.csv'),
    emptyVariants.map(e => ({
      productId: e.productId,
      productName: e.productName,
      variantId: e.variantId,
      color: e.color,
      sku: e.sku,
      url: '',
      basename: '',
      status: 'ok' as const,
      resolvedUrl: '',
      cdnFile: '',
    })),
  )

  console.log('\n=== Photo audit summary ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`\nReports: ${OUT_DIR}`)

  if (fixableConfirmed.length > 0) {
    console.log('\nSample fixable (spacing):')
    for (const r of fixableConfirmed.slice(0, 8)) {
      console.log(`  ${r.productName} / ${r.color}: ${r.basename} → ${r.cdnFile}`)
    }
  }
  if (brokenAfterHttp.length > 0) {
    console.log('\nSample broken:')
    for (const r of brokenAfterHttp.slice(0, 12)) {
      console.log(`  ${r.productName} / ${r.color}: ${r.url}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
