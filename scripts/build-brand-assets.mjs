import fs from 'node:fs/promises';
import sharp from 'sharp';

async function main() {
  if (process.argv[2]) await fs.copyFile(process.argv[2], 'public/logo.png');
  const source = 'public/logo.png';
  for (const size of [192, 512]) {
    await sharp(source).resize(size, size).flatten({ background: '#ffffff' }).png().toFile(`public/icon-${size}.png`);
  }
  await sharp(source).resize(180, 180).flatten({ background: '#ffffff' }).png().toFile('public/apple-touch-icon.png');
  const sizes = [16, 32, 48, 256];
  const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).flatten({ background: '#ffffff' }).ensureAlpha().png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((png, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await fs.writeFile('src/app/favicon.ico', Buffer.concat([header, ...images]));
  console.log('Generated logo, favicon, Apple touch icon, and installed-app icons.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
