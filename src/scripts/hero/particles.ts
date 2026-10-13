// Particles that spell a word, speak it as a waveform, and re-form in the next script.
// One draw call: every particle carries its from/to targets and seeds; the GPU does the motion.

import { readColor, reducedMotion } from "../theme";
import { EDGE_SHARE, loadFont, random, type Script, sampleWord } from "./glyphs";
import { multiply, perspective, rotateX, rotateY, translate } from "./mat4";
import { moment, shownIndex, skipToMorph } from "./timeline";

const VERT = `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 aSeed;
attribute float aKind;
uniform mat4 uMVP;
uniform float uTime;
uniform float uK1;
uniform float uK2;
uniform float uWaveW;
uniform vec3 uPointer;
uniform vec4 uShock;
uniform float uAspect;
uniform float uSize;
uniform float uFocus;
uniform float uLift;
uniform vec3 uDot;
uniform vec3 uAccent;
varying vec3 vColor;
varying float vAlpha;

float ease(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }

// A voice-memo waveform: bars of dots whose height moves like syllables.
float speech(float x, float t) {
  float u = x / uWaveW + 0.5;
  float win = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
  float s = abs(sin(x * 7.3 + t * 9.0) * sin(x * 2.9 - t * 5.7 + 1.3));
  float syllable = 0.3 + 0.7 * abs(sin(x * 1.7 + t * 2.3));
  return win * (0.1 + 0.9 * s * syllable);
}

void main() {
  vec3 p;
  float wave = 0.0;
  float dust = step(0.5, aKind) * step(aKind, 1.5);
  float edge = step(1.5, aKind);
  if (dust > 0.5) {
    p = aFrom + vec3(sin(uTime * 0.05 + aSeed.x * 6.283), cos(uTime * 0.04 + aSeed.y * 6.283), 0.0) * 0.18;
  } else {
    float bar = 0.052;
    float bx = (floor((aSeed.w - 0.5) * uWaveW / bar) + 0.5) * bar;
    vec3 w = vec3(bx, (aSeed.y * 2.0 - 1.0) * speech(bx, uTime) * 0.5, (aSeed.z - 0.5) * 0.04);
    // Left to right, like reading aloud.
    float d1 = (aFrom.x / uWaveW + 0.5) * 0.55 + aSeed.x * 0.12;
    float d2 = (bx / uWaveW + 0.5) * 0.55 + aSeed.x * 0.12;
    float e1 = ease(clamp(uK1 * 1.67 - d1, 0.0, 1.0));
    float e2 = ease(clamp(uK2 * 1.67 - d2, 0.0, 1.0));
    p = mix(mix(aFrom, w, e1), aTo, e2);
    float swirl = sin(3.14159 * e1) + sin(3.14159 * e2);
    vec3 n = vec3(sin(aSeed.y * 41.0 + uTime * 1.3), cos(aSeed.z * 37.0 + uTime * 1.1), sin(aSeed.x * 43.0 + uTime * 0.9));
    p += n * swirl * 0.16;
    p += vec3(sin(uTime * 0.8 + aSeed.x * 6.283), cos(uTime * 0.7 + aSeed.y * 6.283), sin(uTime * 0.6 + aSeed.z * 6.283)) * 0.006;
    wave = e1 * (1.0 - e2);
  }

  vec4 clip = uMVP * vec4(p, 1.0);
  vec2 ndc = clip.xy / clip.w;
  ndc.y += uLift;
  vec2 stretch = vec2(uAspect, 1.0);

  vec2 dv = (ndc - uPointer.xy) * stretch;
  float dist = length(dv);
  ndc += dv / max(dist, 1e-4) / stretch * uPointer.z * 0.085 * exp(-dist * dist / 0.018) * (1.0 - dust);

  vec2 sv = (ndc - uShock.xy) * stretch;
  float sd = length(sv);
  float age = uTime - uShock.z;
  float ring = step(0.0, age) * exp(-pow((sd - age * 1.25) * 9.0, 2.0)) * exp(-age * 1.8);
  ndc += sv / max(sd, 1e-4) / stretch * ring * uShock.w * 0.06;

  gl_Position = vec4(ndc * clip.w, clip.z, clip.w);

  // Shallow depth of field: off the focal plane, dots grow and fade like bokeh.
  float blur = abs(clip.w - uFocus) / uFocus;
  float grow = 1.0 + blur * 6.0;
  // Edges are fine and bright, fills softer: letters read like an engraving, not a blur.
  float settled = 1.0 - wave;
  gl_PointSize = min(64.0, uSize * (uFocus / clip.w) * mix(0.65, 1.35, aSeed.y) * grow * mix(1.0, 0.82, edge * settled));
  float tone = mix(mix(0.32, 0.78, aSeed.z), 1.0, edge * settled);
  vAlpha = tone / (grow * grow) * mix(1.0, 0.55, dust);
  vColor = mix(uDot, uAccent, step(0.86, aSeed.x) * wave);
}
`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.22, d) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;

const FOV = 0.5;
const WORD_W = 3.6;
const INTRO = 2.4;
const DPR_CAP = 2;

export interface HeroOptions {
  scripts: Script[];
  loop: boolean;
  onScript?: (index: number) => void;
  onStats?: (particles: number, fps: number) => void;
}

export interface HeroControl {
  still: boolean; // reduced motion: one frame, no scatter, no loop
  next(): void;
  setPaused(paused: boolean): void;
}

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("hero: could not create shader");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

// Compiles off the main thread where KHR_parallel_shader_compile exists, polling instead of blocking.
function link(gl: WebGLRenderingContext): Promise<WebGLProgram> {
  const p = gl.createProgram();
  if (!p) return Promise.reject(new Error("hero: could not create program"));
  const vs = shader(gl, gl.VERTEX_SHADER, VERT);
  gl.attachShader(p, vs);
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  const ext = gl.getExtension("KHR_parallel_shader_compile");
  return new Promise((resolve, reject) => {
    const check = () => {
      if (ext && !gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) {
        requestAnimationFrame(check);
      } else if (gl.getProgramParameter(p, gl.LINK_STATUS)) {
        resolve(p);
      } else {
        reject(new Error(`hero: ${gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(p)}`));
      }
    };
    check();
  });
}

function counts(width: number, height: number, software: boolean): { words: number; dust: number } {
  const words = Math.round(Math.min(software ? 5000 : 16000, Math.max(software ? 3000 : 6000, (width * height) / 80)));
  return { words, dust: Math.round(words * 0.12) };
}

// Without a GPU every particle is drawn on the CPU, so draw fewer, less often.
function softwareRenderer(gl: WebGLRenderingContext): boolean {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

const easeOut = (x: number) => 1 - (1 - x) ** 3;

export async function mountHero(
  canvas: HTMLCanvasElement,
  surface: HTMLElement,
  opts: HeroOptions,
): Promise<HeroControl> {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: true });
  if (!gl) throw new Error("hero: WebGL unavailable");

  const { scripts } = opts;
  const first = scripts[0];
  if (!first) throw new Error("hero: no scripts");
  const box = surface.getBoundingClientRect();
  const software = softwareRenderer(gl);
  const { words, dust } = counts(box.width, box.height, software);
  const minFrame = software ? 1000 / 30 : 0;
  const total = words + dust;
  const rand = random(7);

  // Per-particle constants.
  const seeds = new Float32Array(total * 4).map(() => rand());
  const kinds = new Float32Array(total).fill(2, 0, Math.round(words * EDGE_SHARE)).fill(1, words);
  const dustAt = new Float32Array(dust * 3);
  for (let i = 0; i < dust; i++) {
    dustAt[i * 3] = (rand() - 0.5) * 12;
    dustAt[i * 3 + 1] = (rand() - 0.5) * 7;
    dustAt[i * 3 + 2] = -7 + rand() * 8.5;
  }
  const withDust = (wordsAt: Float32Array) => {
    wordsAt.set(dustAt, words * 3);
    return wordsAt;
  };

  // Where particles start: loose noise in a volume around the word.
  const scatter = withDust(new Float32Array(total * 3));
  for (let i = 0; i < words; i++) {
    scatter[i * 3] = (rand() - 0.5) * 7;
    scatter[i * 3 + 1] = (rand() - 0.5) * 3.6;
    scatter[i * 3 + 2] = -2.5 + rand() * 3;
  }

  const prog = await link(gl);
  gl.useProgram(prog);

  const upload = (data: Float32Array) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  const attr = (name: string) => gl.getAttribLocation(prog, name);
  const bindAttr = (loc: number, buf: WebGLBuffer | null, size: number) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  const aFrom = attr("aFrom");
  const aTo = attr("aTo");
  bindAttr(attr("aSeed"), upload(seeds), 4);
  bindAttr(attr("aKind"), upload(kinds), 1);
  const scatterBuf = upload(scatter);

  // Glyph targets, sampled as their fonts arrive.
  const glyphs: (WebGLBuffer | null)[] = scripts.map(() => null);
  const sample = (i: number) => {
    const s = scripts[i];
    if (!s || glyphs[i]) return;
    const at = new Float32Array(total * 3);
    sampleWord(s, s.word, words, at, 101 + i);
    glyphs[i] = upload(withDust(at));
  };
  await loadFont(first);
  sample(0);
  const idle = (fn: () => void) =>
    "requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 60);
  for (const [i, s] of scripts.entries()) {
    if (i > 0)
      loadFont(s).then(
        () => idle(() => sample(i)),
        () => undefined,
      );
  }

  const u = (name: string) => gl.getUniformLocation(prog, name);
  const U = {
    mvp: u("uMVP"),
    time: u("uTime"),
    k1: u("uK1"),
    k2: u("uK2"),
    waveW: u("uWaveW"),
    pointer: u("uPointer"),
    shock: u("uShock"),
    aspect: u("uAspect"),
    size: u("uSize"),
    focus: u("uFocus"),
    lift: u("uLift"),
    dot: u("uDot"),
    accent: u("uAccent"),
  };
  gl.uniform1f(U.waveW, WORD_W * 0.92);

  const still = reducedMotion();
  const pointer = { x: 0, y: 0, on: 0, target: 0 };
  const turn = { yaw: 0, pitch: 0 };
  const shock = { x: 0, y: 0, start: -10, strength: 0 };
  let time = 0; // drives all motion; frozen while paused
  let clock = 0; // position in the script sequence
  let intro = still ? INTRO : 0;
  let stillIndex = 0;
  let paused = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let shown = -1;
  let fps = 60;
  let fpsAt = 0;
  let dist = 6;
  let mobile = false;

  function setColors() {
    const bg = readColor("--bg");
    const dot = readColor("--dot");
    const accent = readColor("--accent");
    const light = document.documentElement.dataset.theme === "light";
    gl?.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1);
    gl?.uniform3f(U.dot, dot[0] / 255, dot[1] / 255, dot[2] / 255);
    gl?.uniform3f(U.accent, accent[0] / 255, accent[1] / 255, accent[2] / 255);
    gl?.enable(gl.BLEND);
    // Light on dark adds up like light; ink on paper stacks like ink.
    if (light) gl?.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl?.blendFunc(gl.ONE, gl.ONE);
  }

  function resize() {
    const r = surface.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gl?.viewport(0, 0, canvas.width, canvas.height);
    const aspect = r.width / Math.max(1, r.height);
    mobile = r.width < 720;
    const t = Math.tan(FOV / 2);
    const distW = WORD_W / ((mobile ? 0.94 : 0.72) * 2 * t * aspect);
    const distH = 1 / ((mobile ? 0.3 : 0.46) * 2 * t);
    dist = Math.max(distW, distH);
    gl?.uniform1f(U.aspect, aspect);
    gl?.uniform1f(U.focus, dist);
    gl?.uniform1f(U.size, (mobile ? 1.8 : 2.3) * dpr);
    gl?.uniform1f(U.lift, mobile ? 0.16 : 0.14);
  }

  function camera() {
    const r = canvas.width / Math.max(1, canvas.height);
    const view = multiply(translate(0, 0, -dist), multiply(rotateX(turn.pitch), rotateY(turn.yaw)));
    gl?.uniformMatrix4fv(U.mvp, false, multiply(perspective(FOV, r, 0.1, 80), view));
  }

  function bindTargets(from: WebGLBuffer | null, to: WebGLBuffer | null) {
    bindAttr(aFrom, from, 3);
    bindAttr(aTo, to, 3);
  }

  // Works out which targets to blend and how far along we are.
  function stage(): void {
    if (!gl) return;
    if (still) {
      const g = glyphs[stillIndex] ?? glyphs[0] ?? null;
      bindTargets(g, g);
      gl.uniform1f(U.k1, 0);
      gl.uniform1f(U.k2, 0);
      report(stillIndex);
      return;
    }
    if (intro < INTRO) {
      bindTargets(scatterBuf, glyphs[0] ?? null);
      gl.uniform1f(U.k1, 0);
      gl.uniform1f(U.k2, easeOut(intro / INTRO));
      report(0);
      return;
    }
    const m = moment(clock, opts.loop ? scripts.length : 1);
    bindTargets(glyphs[m.index] ?? null, glyphs[m.next] ?? null);
    gl.uniform1f(U.k1, opts.loop ? m.k1 : 0);
    gl.uniform1f(U.k2, opts.loop ? m.k2 : 0);
    report(shownIndex(m));
  }

  function report(i: number) {
    if (i !== shown) {
      shown = i;
      opts.onScript?.(i);
    }
  }

  function advance(dt: number) {
    time += dt;
    if (intro < INTRO) {
      intro = Math.min(INTRO, intro + dt);
      return;
    }
    if (!opts.loop) return;
    const m = moment(clock, scripts.length);
    // Hold until the next script has been sampled.
    const ready = glyphs[m.next] !== null;
    clock = ready || m.k1 > 0 ? clock + dt : Math.min(clock + dt, clock + skipToMorph(clock) - 1e-3);
  }

  function draw() {
    if (!gl) return;
    turn.yaw += (pointer.x * 0.3 * pointer.target - turn.yaw) * 0.04;
    turn.pitch += (-pointer.y * 0.16 * pointer.target - turn.pitch) * 0.04;
    pointer.on += (pointer.target - pointer.on) * 0.08;
    camera();
    stage();
    gl.uniform1f(U.time, still ? 4 : time);
    gl.uniform3f(U.pointer, pointer.x, pointer.y, still ? 0 : pointer.on);
    gl.uniform4f(U.shock, shock.x, shock.y, shock.start, shock.strength);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, total);
  }

  function frame(now: number) {
    raf = 0;
    if (paused || !visible || document.hidden) return;
    if (last && now - last < minFrame) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    advance(dt);
    draw();
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    if (now - fpsAt > 500) {
      fpsAt = now;
      opts.onStats?.(words, Math.round(fps));
    }
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (still || paused) {
      draw();
      return;
    }
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  setColors();
  resize();
  if (!still) opts.onStats?.(words, 60);
  run();

  new ResizeObserver(() => {
    resize();
    if (still || paused) draw();
  }).observe(surface);
  new IntersectionObserver(([e]) => {
    visible = e?.isIntersecting ?? false;
    if (visible) run();
  }).observe(surface);
  document.addEventListener("visibilitychange", run);
  document.addEventListener("themechange", () => {
    setColors();
    draw();
  });

  const toNdc = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
  };

  const next = () => {
    if (still) {
      // Jump straight to the next script whose font has arrived.
      for (let step = 1; step <= scripts.length; step++) {
        const i = (stillIndex + step) % scripts.length;
        if (glyphs[i]) {
          stillIndex = i;
          break;
        }
      }
      draw();
      return;
    }
    if (intro < INTRO) return;
    clock += skipToMorph(clock);
    run();
  };

  if (!still) {
    surface.addEventListener("pointermove", (e) => {
      [pointer.x, pointer.y] = toNdc(e);
      pointer.target = 1;
    });
    surface.addEventListener("pointerleave", () => {
      pointer.target = 0;
    });
    surface.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest("a, button")) return;
      [shock.x, shock.y] = toNdc(e);
      shock.start = time;
      shock.strength = 1;
      next();
    });
  }

  return {
    still,
    next,
    setPaused(p: boolean) {
      paused = p;
      if (!p) run();
    },
  };
}
