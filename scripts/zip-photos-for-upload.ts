/**
 * Собрать zip из папки со стоком (Samsung Stock / …) для того же пайплайна, что `match-photos`
 * и POST /admin/photos/upload: внутри архива сохраняются относительные пути.
 *
 *   npm run zip-photos-for-upload -- "C:\staging\bender-photos-clean" ./photos-upload.zip
 *   npm run zip-photos-for-upload -- .\Фото .\photos-upload.zip   (из корня репо на Windows)
 *
 * Дальше по удачному циклу:
 *   npm run upload-photos -- ./photos-upload.zip
 *   npm run match-photos -- "<та же папка>" --sheet ./reports https://bendershop.store/photos --write --clear-photos
 * Затем /sync в боте.
 */
import fs from 'fs'
import path from 'path'

import AdmZip from 'adm-zip'

function usage(): never {
  console.error(
    'Usage: ts-node scripts/zip-photos-for-upload.ts <staging_photo_dir> [out_zip_path]',
  )
  console.error('  Default out: ./photos-upload.zip in cwd')
  process.exit(1)
}

function findProjectPhotoFolder(cwd: string): string | undefined {
  /** Поддержка кириллического имени «Фото» в корне репо, если npm исказил путь в аргументе. */
  const fotoName = '\u0424\u043e\u0442\u043e'
  const direct = path.join(cwd, fotoName)
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return path.resolve(direct)

  try {
    for (const ent of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      const n = ent.name
      const low = n.normalize('NFC').toLowerCase()
      if (low === fotoName.toLowerCase() || low === 'photo' || low === 'photos') {
        return path.resolve(path.join(cwd, n))
      }
    }
  } catch {
    /* ignore */
  }
  return undefined
}

/**
 * Если указали `...\bender-shop\Фото`, а из-за кодировки путь не находится — ищем каталог «Фото» в родителе.
 */
function tryDiscoverFotoInParentOf(raw: string, push: (p: string) => void): void {
  const foto = '\u0424\u043e\u0442\u043e'
  try {
    const abs = path.resolve(raw.trim())
    const parent = path.dirname(abs)
    const base = path.basename(abs).normalize('NFC')
    if (base !== foto && base.toLowerCase() !== 'photo' && base.toLowerCase() !== 'photos') return
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return
    const hit = findProjectPhotoFolder(parent)
    if (hit) push(hit)
  } catch {
    /* ignore */
  }
}

/** Несколько попыток разрешения пути (абсолютный, относительно cwd, авто-поиск папки Фото). */
function resolveExistingStagingDir(rawArg: string): { dir: string } | null {
  const raw = rawArg.trim().replace(/^["']+|["']+$/g, '')
  if (!raw) return null

  const tried: string[] = []
  const cwd = process.cwd()

  const candidates: string[] = []
  const push = (p: string) => {
    const n = path.normalize(path.resolve(p))
    if (!candidates.includes(n)) candidates.push(n)
  }

  push(raw)
  push(path.join(cwd, raw))
  push(path.join(cwd, raw.replace(/^\.\/+/, '')))

  tryDiscoverFotoInParentOf(raw, push)

  const found = findProjectPhotoFolder(cwd)
  if (found) push(found)

  for (const cand of candidates) {
    tried.push(cand)
    if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) {
      return { dir: cand }
    }
  }

  console.error('Tried paths:', tried.join(' | '))
  console.error(`cwd: ${cwd}`)
  return null
}

function main(): void {
  const resolved = resolveExistingStagingDir(process.argv[2] ?? '')
  const outArg = process.argv[3]
  const outZip = outArg
    ? path.isAbsolute(outArg)
      ? path.resolve(outArg)
      : path.resolve(process.cwd(), outArg)
    : path.resolve(process.cwd(), 'photos-upload.zip')

  if (!process.argv[2]) usage()
  if (!resolved) {
    console.error('Directory not found (see tried paths above).')
    console.error('')
    console.error('В корне проекта выполни (надёжнее короткий .\\Фото при кириллице в npm):')
    console.error('  npm run zip-photos-for-upload -- .\\Фото .\\photos-upload.zip')
    usage()
  }

  const inDir = resolved.dir
  console.log(`Using staging dir: ${inDir}`)

  const zip = new AdmZip()
  zip.addLocalFolder(inDir)
  zip.writeZip(outZip)
  console.log(`Wrote ${outZip}`)
  console.log('Next: npm run upload-photos -- ./' + path.basename(outZip))
}

main()
