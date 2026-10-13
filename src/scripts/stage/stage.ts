// The stage: one particle world behind the whole page. A GPU simulation (springs, curl-noise currents,
// pointer forces) pulls particles toward whatever the section in view asks for; a point pass,
// motion trails, bloom and grain turn it into the final image.

import { loadFont, random, SCRIPTS, sampleWord } from "../hero/glyphs";
import { multiply, perspective, rotateX, rotateY, translate } from "../hero/mat4";
import { CYCLE, HOLD, moment, skipToMorph, TO_WAVE, WAVE } from "../hero/timeline";
import { readColor, reducedMotion } from "../theme";
import { bindTexture, framebuffer, type Program, programs, softwareRenderer, texture } from "./gl";
import { BLUR, BRIGHT, COMPOSITE, FADE, FULLSCREEN, POINTS_FRAG, POINTS_VERT, SIM } from "./glsl";
import {
  type Cycle,
  DIST,
  FOV,
  type Framing,
  frame,
  isScene,
  PHONE,
  SCENES,
  type SceneName,
  SHAPE,
  toShape,
} from "./scenes";

export interface StageOptions {
  onScript?: (cycle: Cycle, index: number) => void;
  onStats?: (particles: number, fps: number) => void;
  onPulse?: (energy: number) => void; // 0..1 activity, for sound
  onMorph?: (cycle: Cycle, index: number) => void; // a new script just formed
}

export interface Stage {
  still: boolean;
  particles: number;
  next(): void;
  setPaused(paused: boolean): void;
}

const STILL_STEPS = 200;
const DT = 1 / 60;

export async function mountStage(canvas: HTMLCanvasElement, opts: StageOptions): Promise<Stage> {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("stage: WebGL2 unavailable");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("stage: float render targets unavailable");

  const software = softwareRenderer(gl);
  const phone = innerWidth < PHONE;
  const N = software ? 64 : phone ? 128 : 256;
  const count = N * N;
  const still = reducedMotion();
  const bloom = !software;
  const dprCap = software ? 1 : phone ? 1.5 : 1.75;

  // programs() returns one entry per source pair, in order.
  const [sim, points, fade, bright, blur, composite] = (await programs(gl, [
    [FULLSCREEN, SIM],
    [POINTS_VERT, POINTS_FRAG],
    [FULLSCREEN, FADE],
    [FULLSCREEN, BRIGHT],
    [FULLSCREEN, BLUR],
    [FULLSCREEN, COMPOSITE],
  ])) as [Program, Program, Program, Program, Program, Program];

  gl.bindVertexArray(gl.createVertexArray());

  // Simulation state: positions start as loose noise, so the first scene assembles out of nothing.
  const rand = random(11);
  const start = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    start[i * 4] = (rand() - 0.5) * 9;
    start[i * 4 + 1] = (rand() - 0.5) * 5;
    start[i * 4 + 2] = (rand() - 0.5) * 4;
    start[i * 4 + 3] = 1;
  }
  const zero = new Float32Array(count * 4);
  const pos = [texture(gl, N, N, "f32", start), texture(gl, N, N, "f32", start)];
  const vel = [texture(gl, N, N, "f32", zero), texture(gl, N, N, "f32", zero)];
  const simFb = pos.map((p, i) => framebuffer(gl, [p, vel[i] as WebGLTexture]));
  const target = texture(gl, N, N, "f32", zero);
  let cur = 0;

  // Screen-sized targets, rebuilt on resize.
  let scene: WebGLTexture | null = null;
  let sceneFb: WebGLFramebuffer | null = null;
  let bloomTex: WebGLTexture[] = [];
  let bloomFb: WebGLFramebuffer[] = [];
  let bw = 1;
  let bh = 1;

  function resize() {
    if (!gl) return;
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    canvas.width = Math.max(1, Math.round(innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    for (const t of [scene, ...bloomTex]) if (t) gl.deleteTexture(t);
    for (const f of [sceneFb, ...bloomFb]) if (f) gl.deleteFramebuffer(f);
    scene = texture(gl, canvas.width, canvas.height, "f16");
    sceneFb = framebuffer(gl, [scene]);
    const div = phone ? 4 : 2;
    bw = Math.max(1, Math.round(canvas.width / div));
    bh = Math.max(1, Math.round(canvas.height / div));
    bloomTex = [texture(gl, bw, bh, "f16"), texture(gl, bw, bh, "f16")];
    bloomFb = bloomTex.map((t) => framebuffer(gl, [t]));
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFb);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Glyph targets: sampled on demand and cached. Key is "name:3" or "hello:0".
  const glyphs = new Map<string, Float32Array>();
  const fonts = new Set<number>();
  const keyOf = (c: Cycle, i: number) => `${c}:${i}`;
  const glyphFor = (c: Cycle, i: number): Float32Array | null => {
    const key = keyOf(c, i);
    const hit = glyphs.get(key);
    if (hit) return hit;
    const s = SCRIPTS[i];
    if (!s || !fonts.has(i)) return null;
    const data = new Float32Array(count * 4);
    sampleWord(s, c === "name" ? s.word : s.hello, count, data, 101 + i, 4);
    glyphs.set(key, data);
    return data;
  };
  const first = SCRIPTS[0];
  if (first) {
    await loadFont(first);
    fonts.add(0);
  }
  for (const [i, s] of SCRIPTS.entries()) {
    if (i > 0)
      loadFont(s).then(
        () => fonts.add(i),
        () => undefined,
      );
  }

  // Scene state.
  let active: SceneName = "name";
  let activeEl: HTMLElement | null = document.querySelector<HTMLElement>('[data-scene="name"]');
  let framing: Framing = frame(SCENES.name, innerWidth, innerHeight);
  const clocks: Record<Cycle, number> = { name: 0, hello: 0 };
  let uploaded = "";
  let shape: number = SHAPE.glyph;
  let energy = 1;
  let shown = "";

  const upload = (data: Float32Array, key: string) => {
    if (!gl || key === uploaded) return;
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, data);
    uploaded = key;
    energy = 1;
  };

  // For a cycling scene: which script is the target, and is it the spoken waveform right now?
  function cycleStep(c: Cycle, dt: number): void {
    let clock = clocks[c];
    const m = moment(clock, SCRIPTS.length);
    const forming = m.local >= HOLD + TO_WAVE + WAVE;
    // Hold until the next script's font has arrived.
    if (!still && glyphFor(c, m.next) === null && m.local + dt >= HOLD) clock = clock + skipToMorph(clock) - 1e-3;
    else if (!still) clock += dt;
    clocks[c] = clock;
    const index = forming ? m.next : m.index;
    const speaking = m.local >= HOLD && !forming;
    shape = speaking ? SHAPE.wave : SHAPE.glyph;
    const data = glyphFor(c, index);
    if (data) upload(data, keyOf(c, index));
    const label = `${c}:${index}`;
    if (label !== shown) {
      if (shown && forming) opts.onMorph?.(c, index);
      shown = label;
      opts.onScript?.(c, index);
    }
    if (speaking) energy = Math.max(energy, 0.6);
  }

  // Inputs.
  const pointer = {
    ndc: [0, 0] as [number, number],
    on: 0,
    target: 0,
    last: [0, 0] as [number, number],
    vel: [0, 0] as [number, number],
  };
  const shock = { at: [0, 0] as [number, number], strength: 0 };
  let scrollY = window.scrollY;
  let scrollVel = 0;
  const turn = { yaw: 0, pitch: 0 };

  const toNdc = (e: PointerEvent): [number, number] => [
    (e.clientX / innerWidth) * 2 - 1,
    -((e.clientY / innerHeight) * 2 - 1),
  ];

  if (!still) {
    window.addEventListener("pointermove", (e) => {
      pointer.ndc = toNdc(e);
      pointer.target = e.pointerType === "touch" ? 0.8 : 1;
    });
    document.documentElement.addEventListener("pointerleave", () => {
      pointer.target = 0;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") pointer.target = 0;
    });
    window.addEventListener("pointerdown", (e) => {
      const el = e.target as Element;
      if (el.closest("a, button, input, [data-figure], figure")) return;
      shock.at = toNdc(e);
      shock.strength = 1;
      const cycle = SCENES[active].cycle;
      if (cycle && el.closest(`[data-scene="${active}"]`)) clocks[cycle] += skipToMorph(clocks[cycle]);
    });
  }

  // Which section is under the middle of the screen decides the scene.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const name = (e.target as HTMLElement).dataset.scene;
        if (!e.isIntersecting || !isScene(name)) continue;
        activeEl = e.target as HTMLElement;
        if (name === active) continue;
        active = name;
        energy = 1;
        const cycle = SCENES[name].cycle;
        if (cycle) clocks[cycle] = 0;
        if (still) settle();
      }
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  for (const el of document.querySelectorAll<HTMLElement>("[data-scene]")) io.observe(el);

  function colors() {
    const bg = readColor("--bg");
    const dot = readColor("--dot");
    const accent = readColor("--accent");
    // Light adds on dark; on paper the composite subtracts, so these are the distance from the background.
    const diff = (c: readonly number[]) => [0, 1, 2].map((i) => Math.abs((c[i] ?? 0) - (bg[i] ?? 0)) / 255);
    return {
      bg: bg.map((v) => v / 255),
      dot: diff(dot),
      accent: diff(accent),
      light: document.documentElement.dataset.theme === "light",
    };
  }
  let palette = colors();

  let time = 0;

  function simulate(dt: number) {
    if (!gl) return;
    const s = SCENES[active];
    const cycle = s.cycle;
    if (cycle) cycleStep(cycle, dt);
    else shape = s.shape;

    const aspect = innerWidth / Math.max(1, innerHeight);
    const want = frame(s, innerWidth, innerHeight);
    // Scenes that follow their section sit at its centre, so they scroll with the page.
    if (s.follow && activeEl) {
      const r = activeEl.getBoundingClientRect();
      want.anchor[1] += 1 - (2 * (r.top + r.height / 2)) / innerHeight;
    }
    const k = still ? 1 : 1 - Math.exp(-dt * 2.6);
    const ky = still ? 1 : 1 - Math.exp(-dt * 12);
    framing = {
      scale: framing.scale + (want.scale - framing.scale) * k,
      anchor: [
        framing.anchor[0] + (want.anchor[0] - framing.anchor[0]) * k,
        framing.anchor[1] + (want.anchor[1] - framing.anchor[1]) * ky,
      ],
      intensity: framing.intensity + (want.intensity - framing.intensity) * k,
    };

    pointer.on += (pointer.target - pointer.on) * (1 - Math.exp(-dt * 6));
    const here = toShape(pointer.ndc, framing, aspect);
    const pv = [(here[0] - pointer.last[0]) / Math.max(dt, 1e-3), (here[1] - pointer.last[1]) / Math.max(dt, 1e-3)];
    pointer.vel = [
      pointer.vel[0] + ((pv[0] ?? 0) - pointer.vel[0]) * 0.3,
      pointer.vel[1] + ((pv[1] ?? 0) - pointer.vel[1]) * 0.3,
    ];
    pointer.last = here;
    const shockAt = toShape(shock.at, framing, aspect);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simFb[1 - cur] ?? null);
    gl.viewport(0, 0, N, N);
    gl.useProgram(sim.prog);
    bindTexture(gl, 0, pos[cur] as WebGLTexture, sim.u("uPos"));
    bindTexture(gl, 1, vel[cur] as WebGLTexture, sim.u("uVel"));
    bindTexture(gl, 2, target, sim.u("uTarget"));
    gl.uniform1f(sim.u("uTime"), time);
    gl.uniform1f(sim.u("uDt"), dt);
    gl.uniform1f(sim.u("uSize"), N);
    gl.uniform1i(sim.u("uShape"), shape);
    gl.uniform1f(sim.u("uSpring"), s.spring);
    gl.uniform1f(sim.u("uDrag"), s.drag);
    gl.uniform1f(sim.u("uFlow"), still ? 0 : s.flow);
    gl.uniform1f(sim.u("uSpin"), s.spin);
    gl.uniform3f(sim.u("uPointer"), here[0], here[1], still ? 0 : pointer.on);
    gl.uniform2f(
      sim.u("uPointerVel"),
      Math.max(-6, Math.min(6, pointer.vel[0] ?? 0)),
      Math.max(-6, Math.min(6, pointer.vel[1] ?? 0)),
    );
    gl.uniform4f(sim.u("uShock"), shockAt[0], shockAt[1], shock.strength * 3.2, 0.5);
    gl.uniform1f(sim.u("uScroll"), still ? 0 : scrollVel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = 1 - cur;
    shock.strength = 0;
  }

  function render() {
    if (!gl || !scene || !sceneFb) return;
    const s = SCENES[active];
    const aspect = canvas.width / Math.max(1, canvas.height);
    const view = multiply(translate(0, 0, -DIST), multiply(rotateX(turn.pitch), rotateY(turn.yaw)));
    const mvp = multiply(perspective(FOV, aspect, 0.1, 100), view);

    // Trails while things move; a clean frame once they settle.
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFb);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const keep = still ? 0 : s.trail * Math.min(1, energy);
    if (keep > 0.02) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
      gl.useProgram(fade.prog);
      gl.uniform1f(fade.u("uKeep"), keep);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(points.prog);
    bindTexture(gl, 0, pos[cur] as WebGLTexture, points.u("uPos"));
    bindTexture(gl, 1, vel[cur] as WebGLTexture, points.u("uVel"));
    bindTexture(gl, 2, target, points.u("uTarget"));
    gl.uniformMatrix4fv(points.u("uMVP"), false, mvp);
    gl.uniform2f(points.u("uAnchor"), framing.anchor[0], framing.anchor[1]);
    gl.uniform1f(points.u("uScale"), framing.scale);
    const dpr = canvas.width / Math.max(1, innerWidth);
    gl.uniform1f(points.u("uSize"), (phone ? 1.9 : 2.1) * dpr * (software ? 1.4 : 1));
    gl.uniform1f(points.u("uFocus"), DIST);
    // Trails keep a share of each frame, so new light is scaled down to hold total brightness steady;
    // more particles means each one carries less.
    const density = Math.min(1.4, Math.sqrt(16384 / count));
    gl.uniform1f(points.u("uIntensity"), framing.intensity * density * (1 - keep * 0.88) * (palette.light ? 0.9 : 1));
    gl.uniform1f(points.u("uGlyph"), shape === SHAPE.glyph ? 1 : 0);
    gl.uniform1i(points.u("uGrid"), N);
    gl.uniform1i(points.u("uShape"), shape);
    gl.uniform3f(points.u("uColor"), palette.dot[0] ?? 1, palette.dot[1] ?? 1, palette.dot[2] ?? 1);
    gl.uniform3f(points.u("uAccent"), palette.accent[0] ?? 1, palette.accent[1] ?? 0.4, palette.accent[2] ?? 0.2);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND);

    if (bloom) {
      const [a, b] = bloomTex;
      const [fa, fb] = bloomFb;
      if (a && b && fa && fb) {
        gl.viewport(0, 0, bw, bh);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fa);
        gl.useProgram(bright.prog);
        bindTexture(gl, 0, scene, bright.u("uSrc"));
        gl.uniform2f(bright.u("uTexel"), 1 / bw, 1 / bh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.useProgram(blur.prog);
        gl.uniform2f(blur.u("uTexel"), 1 / bw, 1 / bh);
        for (let pass = 0; pass < 2; pass++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          bindTexture(gl, 0, a, blur.u("uSrc"));
          gl.uniform2f(blur.u("uDir"), (1 + pass) / bw, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fa);
          bindTexture(gl, 0, b, blur.u("uSrc"));
          gl.uniform2f(blur.u("uDir"), 0, (1 + pass) / bh);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
    }
    present();
  }

  function present() {
    if (!gl || !scene) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(composite.prog);
    bindTexture(gl, 0, scene, composite.u("uScene"));
    bindTexture(gl, 1, (bloom ? bloomTex[0] : scene) as WebGLTexture, composite.u("uBloom"));
    gl.uniform2f(composite.u("uTexel"), 1 / canvas.width, 1 / canvas.height);
    gl.uniform3f(composite.u("uBg"), palette.bg[0] ?? 0, palette.bg[1] ?? 0, palette.bg[2] ?? 0);
    gl.uniform1f(composite.u("uLight"), palette.light ? 1 : 0);
    gl.uniform1f(composite.u("uBloomGain"), bloom ? (palette.light ? 0.3 : 0.55) : 0);
    gl.uniform1f(composite.u("uTime"), still ? 0 : time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Reduced motion: run the physics to rest off screen, then show one frame.
  function settle() {
    for (let i = 0; i < STILL_STEPS; i++) {
      time = 4;
      simulate(DT);
    }
    render();
  }

  // Main loop.
  let paused = false;
  let raf = 0;
  let last = 0;
  let fps = 60;
  let statAt = 0;
  const minFrame = software ? 1000 / 30 : 0;

  function loop(now: number) {
    raf = 0;
    if (paused || document.hidden) return;
    if (last && now - last < minFrame) {
      raf = requestAnimationFrame(loop);
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : DT;
    last = now;
    time += dt;
    const y = window.scrollY;
    scrollVel += (Math.max(-1, Math.min(1, (y - scrollY) / 60)) - scrollVel) * 0.2;
    scrollY = y;
    turn.yaw += (pointer.ndc[0] * 0.12 * pointer.on - turn.yaw) * 0.05;
    turn.pitch += (-pointer.ndc[1] * 0.08 * pointer.on + Math.sin(time * 0.2) * 0.02 - turn.pitch) * 0.05;
    energy *= Math.exp(-dt / 1.3);
    simulate(dt);
    render();
    fps += (1 / dt - fps) * 0.05;
    if (now - statAt > 500) {
      statAt = now;
      opts.onStats?.(count, Math.round(fps));
    }
    opts.onPulse?.(Math.min(1, energy + Math.hypot(pointer.vel[0] ?? 0, pointer.vel[1] ?? 0) * 0.05 * pointer.on));
    raf = requestAnimationFrame(loop);
  }

  function run() {
    if (still) return;
    if (!raf && !paused && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  // If the GPU drops us (driver reset, too many contexts), stop drawing and let the page stand on its own.
  canvas.addEventListener("webglcontextlost", () => {
    paused = true;
    canvas.remove();
  });

  resize();
  addEventListener("resize", () => {
    resize();
    if (still || paused) render();
  });
  document.addEventListener("visibilitychange", run);
  document.addEventListener("themechange", () => {
    palette = colors();
    if (still || paused) present();
  });

  if (still) settle();
  else run();
  opts.onStats?.(count, 60);

  return {
    still,
    particles: count,
    next() {
      const cycle = SCENES[active].cycle;
      if (!cycle) return;
      if (still) {
        clocks[cycle] = (Math.floor(clocks[cycle] / CYCLE) + 1) * CYCLE;
        settle();
        return;
      }
      clocks[cycle] += skipToMorph(clocks[cycle]);
    },
    setPaused(p: boolean) {
      paused = p;
      if (!p) run();
    },
  };
}
