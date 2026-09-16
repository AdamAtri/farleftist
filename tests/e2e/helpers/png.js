//
// A minimal PNG reader for the visual tests.
//
// Chrome reports a stale value for getComputedStyle(path).fill -- an inline
// fill of red still reads back as the old colour -- so asserting that a state
// is actually painted the right colour means looking at pixels. Playwright
// hands back a PNG buffer; this turns it into something we can sample.
//
const zlib = require('zlib');

function decode(buffer) {
  let pos = 8; // skip the 8-byte signature
  let width, height, bitDepth, colorType;
  const chunks = [];

  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    pos += length + 12; // length + type + data + crc
  }

  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels || bitDepth !== 8) {
    throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);

  // Undo the per-scanline filters (PNG spec section 9).
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));

    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;

      if (filter === 1) line[x] = (line[x] + left) & 0xff;
      else if (filter === 2) line[x] = (line[x] + up) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        line[x] = (line[x] + predictor) & 0xff;
      }
    }

    line.copy(pixels, y * stride);
    previous = line;
  }

  return { width, height, channels, pixels };
}

function hex(r, g, b) {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/* Every colour in the image, most common first. */
function histogram(png) {
  const counts = new Map();

  for (let i = 0; i < png.pixels.length; i += png.channels) {
    const alpha = png.channels === 4 ? png.pixels[i + 3] : 255;
    if (alpha < 250) continue; // ignore antialiased edges and transparency

    const key = hex(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color, count]) => ({ color, count }));
}

/* The colour covering most of the image. */
function dominantColor(buffer) {
  return histogram(decode(buffer))[0].color;
}

/* Colours covering at least `share` of the image (0-1). */
function colorsCovering(buffer, share) {
  const png = decode(buffer);
  const total = png.width * png.height;

  return histogram(png)
    .filter((entry) => entry.count / total >= share)
    .map((entry) => entry.color);
}

/* How much of the image is exactly this colour, 0-1. Use this instead of
   dominantColor for a state whose bounding box is mostly its neighbours. */
function shareOf(buffer, color) {
  const png = decode(buffer);
  const match = histogram(png).find((entry) => entry.color === color);

  return match ? match.count / (png.width * png.height) : 0;
}

module.exports = { decode, histogram, dominantColor, colorsCovering, shareOf };
