import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const CATEGORIES_DIR = path.join(__dirname, '..', 'public', 'categories')

async function optimizeDirectory(dir: string, maxWidth: number, quality: number) {
  if (!fs.existsSync(dir)) return

  const files = fs.readdirSync(dir)
  for (const file of files) {
    const filePath = path.join(dir, file)
    const ext = path.extname(file).toLowerCase()

    if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue

    const webpPath = filePath.replace(ext, '.webp')

    // Skip if webp already exists and is newer
    if (fs.existsSync(webpPath)) {
      const srcStat = fs.statSync(filePath)
      const webpStat = fs.statSync(webpPath)
      if (webpStat.mtimeMs >= srcStat.mtimeMs) continue
    }

    try {
      const info = await sharp(filePath)
        .resize(maxWidth, maxWidth, { fit: 'cover', position: 'center' })
        .webp({ quality })
        .toFile(webpPath)

      const origSize = fs.statSync(filePath).size
      console.log(`${file} → ${path.basename(webpPath)}: ${(origSize / 1024).toFixed(0)}KB → ${(info.size / 1024).toFixed(0)}KB`)
    } catch (err) {
      console.error(`Error optimizing ${file}:`, err)
    }
  }
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public')

async function main() {
  console.log('=== Optimizing category images (256x256, q80) ===')
  await optimizeDirectory(CATEGORIES_DIR, 256, 80)

  console.log('\n=== Optimizing public root images (512x512, q80) ===')
  await optimizeDirectory(PUBLIC_DIR, 512, 80)

  console.log('\nDone!')
}

main()
