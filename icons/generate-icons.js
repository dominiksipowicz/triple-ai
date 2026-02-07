// Run with: node icons/generate-icons.js
// Generates minimal PNG icons using only Node.js built-ins (no npm packages needed)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, bgColor, fgColor) {
  // Create RGBA pixel data
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.2;
  const [bgR, bgG, bgB] = bgColor;
  const [fgR, fgG, fgB] = fgColor;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded rect check
      let inside = true;
      if (x < radius && y < radius) {
        inside = (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2;
      } else if (x >= size - radius && y < radius) {
        inside = (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius ** 2;
      } else if (x < radius && y >= size - radius) {
        inside = (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2;
      } else if (x >= size - radius && y >= size - radius) {
        inside = (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2;
      }

      if (!inside) {
        pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 0;
        continue;
      }

      // Draw three arrows
      let isFg = false;
      const offsets = [-0.22, 0, 0.22];
      const lineW = Math.max(1, size * 0.06);

      for (const off of offsets) {
        const cx = size * (0.5 + off);
        const top = size * 0.28;
        const bottom = size * 0.72;
        const arrowW = size * 0.12;

        // Stem
        if (Math.abs(x - cx) <= lineW && y >= top && y <= bottom) {
          isFg = true;
        }
        // Left arrow head
        const arrowY = y - top;
        if (arrowY >= 0 && arrowY <= arrowW) {
          const expectedX = cx - arrowW + arrowY;
          if (Math.abs(x - expectedX) <= lineW) isFg = true;
          const expectedX2 = cx + arrowW - arrowY;
          if (Math.abs(x - expectedX2) <= lineW) isFg = true;
        }
      }

      if (isFg) {
        pixels[idx] = fgR; pixels[idx + 1] = fgG; pixels[idx + 2] = fgB; pixels[idx + 3] = 255;
      } else {
        pixels[idx] = bgR; pixels[idx + 1] = bgG; pixels[idx + 2] = bgB; pixels[idx + 3] = 255;
      }
    }
  }

  // Build PNG file
  // Add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // filter type: None
    pixels.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([length, typeBuffer, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const sizes = [16, 48, 128];
const bg = [99, 102, 241]; // #6366f1 (indigo)
const fg = [255, 255, 255]; // white

for (const size of sizes) {
  const png = createPNG(size, bg, fg);
  const filepath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(filepath, png);
  console.log(`Generated icon${size}.png (${png.length} bytes)`);
}
