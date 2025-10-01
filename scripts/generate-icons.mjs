import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const iconsDir = path.resolve('src-tauri', 'icons');
const sizes = [16];
const bgColor = '#000000';
const text = 'SE';
const textColor = '#25D090';
const cornerRadiusPx = 6; // rounded corner radius in pixels (updated per request)

function svgForSize(size) {
  const fontSize = Math.round(size * 0.68); // tuned for readability across sizes
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="0" y="0" width="${size}" height="${size}" rx="${cornerRadiusPx}" ry="${cornerRadiusPx}" fill="${bgColor}"/>
  <text x="50%" y="50%" dy="0.3em" fill="${textColor}" font-size="${fontSize}" font-weight="700" font-family="Inter, Segoe UI, Arial, sans-serif" text-anchor="middle" dominant-baseline="central" alignment-baseline="central">${text}</text>
</svg>`;
  return svg;
}

async function generatePngBuffer(size) {
  const svg = svgForSize(size);
  const svgBuffer = Buffer.from(svg);
  const pngBuffer = await sharp(svgBuffer)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return pngBuffer;
}

async function main() {
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  console.log('Generating PNGs for sizes:', sizes.join(', '));
  const pngBuffersBySize = new Map();

  for (const size of sizes) {
    const pngBuffer = await generatePngBuffer(size);
    pngBuffersBySize.set(size, pngBuffer);
  }

  // Write individual .ico files (single-size)
  console.log('Writing individual ICO files...');
  for (const size of sizes) {
    const icoBuffer = await pngToIco(pngBuffersBySize.get(size));
    const outPath = path.join(iconsDir, `icon-${size}.ico`);
    fs.writeFileSync(outPath, icoBuffer);
    console.log('✔', outPath);
  }

  // Write multi-size icon.ico
  console.log('Writing multi-size icon.ico...');
  const multiIcoBuffer = await pngToIco(sizes.map((s) => pngBuffersBySize.get(s)));
  const multiIconPath = path.join(iconsDir, 'icon.ico');
  fs.writeFileSync(multiIconPath, multiIcoBuffer);
  console.log('✔', multiIconPath);

  console.log('All icons generated successfully.');
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});