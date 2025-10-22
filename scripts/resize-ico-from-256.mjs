import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { parseICO } from 'icojs'
// Use icojs to decode ICO and output PNG buffers (handles BMP entries too)

// Generate 128/64/32/16 ICO files from src-tauri/icons/icon-256.ico
const iconsDir = path.resolve('src-tauri', 'icons')
const sourceIco = path.join(iconsDir, 'icon-256.ico')
const fallbackIco = path.join(iconsDir, 'icon.ico')
const sizes = [128, 64, 32, 16]

// (removed manual ICO parsing; relying on parseICO to produce PNG buffers)

async function loadBasePngBuffer() {
  let icoPath = sourceIco
  if (!fs.existsSync(icoPath)) {
    console.warn(`[warn] ${icoPath} not found, trying fallback icon.ico`)
    icoPath = fallbackIco
  }
  if (!fs.existsSync(icoPath)) {
    throw new Error('No ICO source found in src-tauri/icons (icon-256.ico or icon.ico)')
  }
  const buf = fs.readFileSync(icoPath)
  const images = await parseICO(buf, 'image/png')
  if (!images || images.length === 0) {
    throw new Error('Failed to parse ICO: no images extracted')
  }
  const largest = images.reduce((acc, cur) => (cur.width * cur.height > acc.width * acc.height ? cur : acc))
  const pngBuffer = Buffer.from(largest.buffer)
  return pngBuffer
}

async function main() {
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true })
  }

  console.log('Loading base ICO and extracting PNG...')
  const basePng = await loadBasePngBuffer()

  console.log('Generating resized ICO files:', sizes.join(', '))
  for (const size of sizes) {
    const resizedPng = await sharp(basePng)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer()
    const icoBuf = await pngToIco(resizedPng)
    const outPath = path.join(iconsDir, `icon-${size}.ico`)
    fs.writeFileSync(outPath, icoBuf)
    console.log('✔', outPath)
  }

  console.log('All target ICO sizes generated successfully.')
}

main().catch((err) => {
  console.error('Failed to resize ICO:', err)
  process.exit(1)
})