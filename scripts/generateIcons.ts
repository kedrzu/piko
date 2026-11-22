import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

// Renders every raster icon from the SVG sources in `docs/brand/` (`bun run icons`): the desktop app's icons
// (PNG, macOS `.icns`, Windows `.ico`), the app's favicon and a PNG set of the icon and the mark for anyone who
// needs one. Edit the SVGs, then run this; the outputs are committed. Sizes up to 32 px render from
// `piko-app-icon-small.svg`, whose larger eyes survive rasterising.

const root = path.resolve(import.meta.dirname, '..');
const brandDir = path.join(root, 'docs/brand');
const tauriIconsDir = path.join(root, 'packages/desktop/src-tauri/icons');
const publicDir = path.join(root, 'packages/app/public');
const pngDir = path.join(brandDir, 'png');

const SMALL_ICON_MAX_SIZE = 32;

/** macOS `.icns` entries: each OSType holds a PNG of one pixel size (the `@2x` ones are Retina variants). */
const ICNS_ENTRIES: [type: string, size: number][] = [
    ['icp4', 16],
    ['ic11', 32],
    ['icp5', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024],
];

const icon = await readFile(path.join(brandDir, 'piko-app-icon.svg'));
const smallIcon = await readFile(path.join(brandDir, 'piko-app-icon-small.svg'));
const mark = await readFile(path.join(brandDir, 'piko-mark.svg'));

await mkdir(publicDir, { recursive: true });
await mkdir(pngDir, { recursive: true });

await writeFile(path.join(tauriIconsDir, '32x32.png'), await renderIcon(32));
await writeFile(path.join(tauriIconsDir, '128x128.png'), await renderIcon(128));
await writeFile(path.join(tauriIconsDir, '128x128@2x.png'), await renderIcon(256));
await writeFile(path.join(tauriIconsDir, 'icon.png'), await renderIcon(512));
await writeFile(path.join(tauriIconsDir, 'icon.icns'), await buildIcns());
await writeFile(path.join(tauriIconsDir, 'icon.ico'), await buildIco([16, 24, 32, 48, 64, 128, 256]));

await writeFile(path.join(publicDir, 'favicon.svg'), smallIcon);
await writeFile(path.join(publicDir, 'favicon.ico'), await buildIco([16, 32, 48]));

for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    await writeFile(path.join(pngDir, `piko-app-icon-${size}.png`), await renderIcon(size));
}
for (const height of [64, 128, 256, 512]) {
    await writeFile(path.join(pngDir, `piko-mark-${height}.png`), await renderSvg(mark, { height }));
}

console.log(`Icons written to ${[tauriIconsDir, publicDir, pngDir].map(dir => path.relative(root, dir)).join(', ')}.`);

/** The app icon as a square PNG, from the small-size source at 32 px and below. */
async function renderIcon(size: number) {
    return await renderSvg(size <= SMALL_ICON_MAX_SIZE ? smallIcon : icon, { width: size, height: size });
}

/** Rasterises an SVG at a density high enough that the resize to the target only ever scales down. */
async function renderSvg(svg: Buffer, size: { width?: number; height?: number }) {
    return await sharp(svg, { density: 600 })
        .resize({ ...size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
}

/** An `.icns` of PNG entries: an `icns` header, then per entry its OSType, length and the PNG. */
async function buildIcns() {
    const entries: Buffer[] = [];
    for (const [type, size] of ICNS_ENTRIES) {
        const png = await renderIcon(size);
        const header = Buffer.alloc(8);
        header.write(type, 0, 'ascii');
        header.writeUInt32BE(png.length + 8, 4);
        entries.push(header, png);
    }
    const body = Buffer.concat(entries);
    const header = Buffer.alloc(8);
    header.write('icns', 0, 'ascii');
    header.writeUInt32BE(body.length + 8, 4);
    return Buffer.concat([header, body]);
}

/** An `.ico` of PNG images (Windows Vista and later read them): a directory of entries, then the images. */
async function buildIco(sizes: number[]) {
    const images = await Promise.all(sizes.map(renderIcon));
    const header = Buffer.alloc(6);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);

    const directory = Buffer.alloc(16 * images.length);
    let offset = header.length + directory.length;
    for (const [index, image] of images.entries()) {
        const size = sizes[index] ?? 0;
        const entry = index * 16;
        // A width or height of 256 is written as 0.
        directory.writeUInt8(size % 256, entry);
        directory.writeUInt8(size % 256, entry + 1);
        directory.writeUInt16LE(1, entry + 4);
        directory.writeUInt16LE(32, entry + 6);
        directory.writeUInt32LE(image.length, entry + 8);
        directory.writeUInt32LE(offset, entry + 12);
        offset += image.length;
    }
    return Buffer.concat([header, directory, ...images]);
}
