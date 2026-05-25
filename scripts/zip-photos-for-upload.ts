/**
 * Собрать zip из папки со стоком (Samsung Stock / …) для того же пайплайна, что `match-photos`
 * и POST /admin/photos/upload: внутри архива сохраняются относительные пути.
 *
 *   npm run zip-photos-for-upload -- "C:\staging\bender-photos-clean" ./photos-upload.zip
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

function main(): void {
  const inDir = path.resolve(process.argv[2] ?? '')
  const outArg = process.argv[3]
  const outZip = outArg
    ? path.isAbsolute(outArg)
      ? path.resolve(outArg)
      : path.resolve(process.cwd(), outArg)
    : path.resolve(process.cwd(), 'photos-upload.zip')

  if (!inDir || !fs.existsSync(inDir) || !fs.statSync(inDir).isDirectory()) usage()

  const zip = new AdmZip()
  zip.addLocalFolder(inDir)
  zip.writeZip(outZip)
  console.log(`Wrote ${outZip}`)
  console.log('Next: npm run upload-photos -- ./' + path.basename(outZip))
}

main()
