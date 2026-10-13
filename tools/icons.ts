// Writes the favicon set: an "A" on a 7 x 7 dot matrix, unlit dots faintly visible, as SVG and PNGs.
// Run with `just icons`.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const GLYPH = ["...#...", "..#.#..", "..#.#..", ".#...#.", ".#####.", "#.....#", "#.....#"];
const N = GLYPH.length;
const INK: [number, number, number] = [11, 11, 10];
const PAPER: [number, number, number] = [236, 235, 230];
const ACCENT: [number, number, number] = [255, 91, 46];
const UNLIT = 0.14;

const lit = (x: number, y: number) => GLYPH[y]?.[x] === "#";

// Grid in a 16-unit square: pitch 2, centred.
const PITCH = 2;
const OFFSET = (16 - (N - 1) * PITCH) / 2;
const R = 0.78;

function svg(): string {
  const dots: string[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = OFFSET + x * PITCH;
      const cy = OFFSET + y * PITCH;
      const top = lit(x, y) && y === 0;
      const fill = lit(x, y) ? (top ? "#ff5b2e" : "#ecebe6") : "#ecebe6";
      const opacity = lit(x, y) ? "" : ` fill-opacity="${UNLIT}"`;
      dots.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${fill}"${opacity}/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0b0b0a"/>${dots.join("")}</svg>\n`;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC[(c ^ b) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// Colour of one pixel, supersampled 4 x 4 so the dots come out round.
function shade(px: number, py: number, size: number): [number, number, number] {
  const scale = 16 / size;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const ux = (px + (sx + 0.5) / 4) * scale;
      const uy = (py + (sy + 0.5) / 4) * scale;
      const gx = Math.round((ux - OFFSET) / PITCH);
      const gy = Math.round((uy - OFFSET) / PITCH);
      let c = INK;
      const inside = gx >= 0 && gy >= 0 && gx < N && gy < N;
      if (inside && (ux - (OFFSET + gx * PITCH)) ** 2 + (uy - (OFFSET + gy * PITCH)) ** 2 <= R * R) {
        const on = lit(gx, gy);
        const tone = on ? (gy === 0 ? ACCENT : PAPER) : PAPER;
        const a = on ? 1 : UNLIT;
        c = [INK[0] + (tone[0] - INK[0]) * a, INK[1] + (tone[1] - INK[1]) * a, INK[2] + (tone[2] - INK[2]) * a];
      }
      r += c[0];
      g += c[1];
      b += c[2];
    }
  }
  return [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16)];
}

function png(size: number): Buffer {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(shade(x, y, size), y * (size * 3 + 1) + 1 + x * 3);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // bit depth
  head[9] = 2; // RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}

writeFileSync("public/favicon.svg", svg());
writeFileSync("public/favicon-32.png", png(32));
writeFileSync("public/apple-touch-icon.png", png(180));
