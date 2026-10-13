// What the particles become in each part of the page, and how each scene is framed.

export const SHAPE = { glyph: 0, wave: 1, orb: 2, terrain: 3, knot: 4, galaxy: 5, dust: 6 } as const;

export type SceneName = "name" | "galaxy" | "orb" | "terrain" | "knot" | "dust" | "hello";
export type Cycle = "name" | "hello";

export interface Scene {
  shape: number;
  cycle?: Cycle;
  anchor: readonly [number, number]; // screen offset in NDC, desktop
  phone: readonly [number, number]; // and on phones
  fit: "word" | number; // word fits the width; a number is shape size as a share of half the visible height
  intensity: number;
  phoneIntensity: number;
  spring: number;
  drag: number;
  flow: number;
  spin: number;
  trail: number; // how much of the last frame survives while particles are moving
  follow: boolean; // ride along with its section as the page scrolls
}

const base = { spring: 9, drag: 4.5, flow: 0.35, spin: 0.12, trail: 0.7, follow: true };

export const SCENES: Record<SceneName, Scene> = {
  name: {
    ...base,
    shape: SHAPE.glyph,
    cycle: "name",
    anchor: [0, 0.2],
    phone: [0, 0.22],
    fit: "word",
    intensity: 1,
    phoneIntensity: 1,
    spring: 20,
    drag: 6.5,
    flow: 0.3,
    trail: 0.78,
  },
  galaxy: {
    ...base,
    shape: SHAPE.galaxy,
    anchor: [0.44, -0.04],
    phone: [0, 0.1],
    fit: 0.66,
    intensity: 0.8,
    phoneIntensity: 0.38,
    spring: 4,
    drag: 3.2,
    flow: 0.55,
  },
  orb: { ...base, shape: SHAPE.orb, anchor: [0.42, 0], phone: [0, 0.3], fit: 0.6, intensity: 1, phoneIntensity: 0.55 },
  terrain: {
    ...base,
    shape: SHAPE.terrain,
    anchor: [0.4, -0.06],
    phone: [0, 0.3],
    fit: 0.78,
    intensity: 1,
    phoneIntensity: 0.55,
    spin: 0.05,
  },
  knot: {
    ...base,
    shape: SHAPE.knot,
    anchor: [0.42, 0],
    phone: [0, 0.3],
    fit: 0.7,
    intensity: 0.85,
    phoneIntensity: 0.55,
    spin: 0.16,
  },
  dust: {
    ...base,
    shape: SHAPE.dust,
    anchor: [0, 0],
    phone: [0, 0],
    fit: 0.6,
    intensity: 0.24,
    phoneIntensity: 0.18,
    spring: 1.4,
    drag: 1.8,
    flow: 0.9,
    trail: 0,
    follow: false,
  },
  hello: {
    ...base,
    shape: SHAPE.glyph,
    cycle: "hello",
    anchor: [0, 0],
    phone: [0, 0],
    fit: "word",
    intensity: 1,
    phoneIntensity: 1,
    spring: 20,
    drag: 6.5,
    flow: 0.3,
    trail: 0.78,
  },
};

export const isScene = (v: string | undefined): v is SceneName => v !== undefined && v in SCENES;

export const FOV = 0.6;
export const DIST = 6;
export const WORD_W = 3.6; // widest sampled word, in shape units (word height is 1)
const SHAPE_R = 1.3;

export const PHONE = 720;

export function halfExtents(aspect: number): { hw: number; hh: number } {
  const hh = DIST * Math.tan(FOV / 2);
  return { hw: hh * aspect, hh };
}

export interface Framing {
  scale: number;
  anchor: [number, number];
  intensity: number;
}

// Scale and placement for a scene at a given viewport size.
export function frame(s: Scene, width: number, height: number): Framing {
  const phone = width < PHONE;
  const { hw, hh } = halfExtents(width / Math.max(1, height));
  const scale =
    s.fit === "word"
      ? Math.min(((phone ? 0.92 : 0.7) * 2 * hw) / WORD_W, (phone ? 0.3 : 0.4) * 2 * hh)
      : (s.fit * hh * (phone ? 0.9 : 1)) / SHAPE_R;
  const anchor = phone ? s.phone : s.anchor;
  return { scale, anchor: [anchor[0], anchor[1]], intensity: phone ? s.phoneIntensity : s.intensity };
}

// Pointer position on screen (NDC) to the shape's own units, on the z = 0 plane.
export function toShape(ndc: readonly [number, number], f: Framing, aspect: number): [number, number] {
  const { hw, hh } = halfExtents(aspect);
  return [((ndc[0] - f.anchor[0]) * hw) / f.scale, ((ndc[1] - f.anchor[1]) * hh) / f.scale];
}
