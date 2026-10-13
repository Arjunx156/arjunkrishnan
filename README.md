# Arjun Krishnan

My portfolio is one particle world. Up to 65,536 particles, simulated live on the GPU, sit behind the whole page and become something new in every section. They spell *Arjun* in nine scripts, speak it as a waveform, drift out into a galaxy, wrap into a voice-rippled globe, settle into a loss landscape with a glowing descent path, tie into a trefoil knot, and close by saying *hello* (നമസ്കാരം, नमस्ते, வணக்கம், …). Move through them and they swirl around the cursor; click and they shockwave into the next language. There's an optional sound layer, synthesised live, that hums with the particles and chimes on every new script.

## Quick start

```sh
bun install
just dev        # http://localhost:4321
just check      # lint, types, tests
```

## How it works

It's a static Astro site with no framework runtime: about 65 KB of script, self-hosted fonts, and nothing from a third party.

- **Simulation.** `src/scripts/stage/` keeps every particle's position and velocity in float textures and steps them in a fragment shader. Each step applies a spring toward the current scene's shape, curl-noise currents, pointer push, swirl and drag, a click impulse, and scroll shear. Shapes are computed in the shader (waveform, ring globe, landscape, knot, galaxy, dust); glyphs come from a texture.
- **Rendering.** The particles are drawn as points with depth of field, they flare vermilion when they move fast, and they leave motion trails that hold brightness steady. A bloom pass, a soft tone curve, grain and a vignette finish the image. On light theme the same image is subtracted from paper, so it reads as ink.
- **Scenes.** Every section carries a `data-scene`; whichever one crosses the middle of the screen decides what the particles become, and shapes ride along with their section as you scroll.
- **Glyphs.** Words are drawn to a canvas and sampled; 40% of the particles always trace edges, which keeps letters crisp. The Indic fonts are Noto Sans cut down to the glyphs of two words, about 4 KB each (`tools/name_fonts.py`).
- **Figures.** `src/scripts/figures/` holds six canvas motion graphics, one per project, built from the real numbers. The RAG figure runs Reciprocal Rank Fusion, and the ABMP figure computes its rolling 3σ band from the samples it draws.
- **Restraint.** Shaders compile off the main thread; GPU-less machines get fewer particles at 30 fps; a lost context removes the canvas cleanly; browsers without WebGL2 get a lighter hero. With `prefers-reduced-motion` the physics settles off screen and each scene shows one still frame. Every loop has a Pause control.

All copy and numbers live in `src/data/`. Change `SITE_URL` in `src/data/site.ts` when the domain changes.

Engineered by Arjun Krishnan Suresh.
