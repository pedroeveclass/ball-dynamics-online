// One-off: render logo-mark.svg into favicon.ico, apple-touch-icon.png, og-image.png
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const svg = fs.readFileSync(path.join(root, 'public', 'logo-mark.svg'));

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function renderSquare(size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: transparent })
    .png()
    .toBuffer();
}

// Multi-resolution favicon.ico
const icoSizes = [16, 32, 48, 64, 128, 256];
const pngBufs = await Promise.all(icoSizes.map(renderSquare));
const ico = await pngToIco(pngBufs);
fs.writeFileSync(path.join(root, 'public', 'favicon.ico'), ico);
console.log('wrote public/favicon.ico (' + icoSizes.join(',') + ')');

// apple-touch-icon
const appleBuf = await renderSquare(180);
fs.writeFileSync(path.join(root, 'public', 'apple-touch-icon.png'), appleBuf);
console.log('wrote public/apple-touch-icon.png (180x180)');

// og-image: 1200x630 dark navy with crest centered
const crestBuf = await renderSquare(480);
await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: { r: 10, g: 15, b: 26, alpha: 1 },
  },
})
  .composite([{ input: crestBuf, gravity: 'center' }])
  .png()
  .toFile(path.join(root, 'public', 'og-image.png'));
console.log('wrote public/og-image.png (1200x630)');
