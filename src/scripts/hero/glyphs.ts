// "Arjun" and "hello" in nine scripts, and the sampler that turns a word into particle targets.

export interface Script {
  lang: string;
  word: string; // the name
  hello: string; // the greeting the page closes with
  family: string;
  url?: string;
}

export const SCRIPTS: Script[] = [
  { lang: "English", word: "Arjun", hello: "Hello", family: "Mona Sans" },
  { lang: "Malayalam", word: "അർജുൻ", hello: "നമസ്കാരം", family: "Name Malayalam", url: "/fonts/name/malayalam.woff2" },
  { lang: "Hindi", word: "अर्जुन", hello: "नमस्ते", family: "Name Devanagari", url: "/fonts/name/devanagari.woff2" },
  { lang: "Tamil", word: "அர்ஜுன்", hello: "வணக்கம்", family: "Name Tamil", url: "/fonts/name/tamil.woff2" },
  { lang: "Telugu", word: "అర్జున్", hello: "నమస్కారం", family: "Name Telugu", url: "/fonts/name/telugu.woff2" },
  { lang: "Kannada", word: "ಅರ್ಜುನ್", hello: "ನಮಸ್ಕಾರ", family: "Name Kannada", url: "/fonts/name/kannada.woff2" },
  { lang: "Bengali", word: "অর্জুন", hello: "নমস্কার", family: "Name Bengali", url: "/fonts/name/bengali.woff2" },
  { lang: "Gujarati", word: "અર્જુન", hello: "નમસ્તે", family: "Name Gujarati", url: "/fonts/name/gujarati.woff2" },
  { lang: "Punjabi", word: "ਅਰਜੁਨ", hello: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", family: "Name Gurmukhi", url: "/fonts/name/gurmukhi.woff2" },
];

export async function loadFont(s: Script): Promise<void> {
  if (!s.url) {
    await document.fonts.load(`800 100px "${s.family}"`);
    return;
  }
  const face = new FontFace(s.family, `url(${s.url}) format("woff2")`, { weight: "700" });
  document.fonts.add(await face.load());
}

// Seeded so every visit draws the same particles.
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1200;
const H = 420;
const BOX_W = 1080;
const BOX_H = 300;
const STEP = 2;
// The first share of particles always trace edges, in every script, so the shader can treat them differently.
export const EDGE_SHARE = 0.4;

// Writes `count` points into out: (x, y, z) per particle, or (x, y, z, edge) with stride 4 for a GPU texture.
// Word height is about 1 unit, centred on the origin.
export function sampleWord(s: Script, text: string, count: number, out: Float32Array, seed: number, stride = 3): void {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return;

  const weight = s.url ? 700 : 800;
  g.font = `${weight} 220px "${s.family}"`;
  const m = g.measureText(text);
  const tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const size = 220 * Math.min(BOX_W / tw, BOX_H / th);
  g.font = `${weight} ${size}px "${s.family}"`;
  const f = g.measureText(text);
  const x0 = (W - (f.actualBoundingBoxLeft + f.actualBoundingBoxRight)) / 2 + f.actualBoundingBoxLeft;
  const y0 = (H - (f.actualBoundingBoxAscent + f.actualBoundingBoxDescent)) / 2 + f.actualBoundingBoxAscent;
  g.fillStyle = "#fff";
  g.fillText(text, x0, y0);

  const data = g.getImageData(0, 0, W, H).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (data[(y * W + x) * 4 + 3] ?? 0) > 127;
  const fill: number[] = [];
  const edge: number[] = [];
  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (!on(x, y)) continue;
      const isEdge = !on(x - STEP, y) || !on(x + STEP, y) || !on(x, y - STEP) || !on(x, y + STEP);
      (isEdge ? edge : fill).push(x, y);
    }
  }
  if (fill.length + edge.length === 0) return;

  const rand = random(seed);
  const pick = (list: number[]) => {
    const i = Math.floor(rand() * (list.length / 2)) * 2;
    return [list[i] ?? 0, list[i + 1] ?? 0] as const;
  };
  const scale = 1 / BOX_H;
  const edges = Math.round(count * EDGE_SHARE);
  for (let i = 0; i < count; i++) {
    const onEdge = (i < edges && edge.length > 0) || fill.length === 0;
    const [px, py] = pick(onEdge ? edge : fill);
    const jitter = onEdge ? 0.6 : STEP;
    const o = i * stride;
    out[o] = (px + (rand() - 0.5) * jitter - W / 2) * scale;
    out[o + 1] = -(py + (rand() - 0.5) * jitter - H / 2) * scale;
    out[o + 2] = (rand() + rand() + rand() - 1.5) * (onEdge ? 0.02 : 0.07);
    if (stride === 4) out[o + 3] = onEdge ? 1 : 0;
  }
}
