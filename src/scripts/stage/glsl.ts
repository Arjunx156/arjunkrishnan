// Shaders for the stage: a GPU particle simulation, a point renderer, and a small post chain.
// WebGL2 / GLSL ES 3.00. Positions and velocities live in float textures, one texel per particle.

// Every full-screen pass draws one oversized triangle from gl_VertexID; no buffers needed.
export const FULLSCREEN = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Ashima simplex noise and its curl: divergence-free currents, so particles swirl instead of clumping.
const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 snoise3(vec3 x) {
  return vec3(snoise(x), snoise(x + vec3(-19.1, 33.4, 47.2)), snoise(x + vec3(74.2, -124.5, 99.4)));
}

vec3 curl(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 x0 = snoise3(p - dx), x1 = snoise3(p + dx);
  vec3 y0 = snoise3(p - dy), y1 = snoise3(p + dy);
  vec3 z0 = snoise3(p - dz), z1 = snoise3(p + dz);
  return vec3(y1.z - y0.z - z1.y + z0.y, z1.x - z0.x - x1.z + x0.z, x1.y - x0.y - y1.x + y0.x) / (2.0 * e);
}
`;

// One step of the simulation: spring toward this scene's shape, ride the curl currents,
// get pushed and stirred by the pointer, integrate.
export const SIM = `#version 300 es
precision highp float;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uTarget;
uniform float uTime;
uniform float uDt;
uniform float uSize;
uniform int uShape;
uniform float uSpring;
uniform float uDrag;
uniform float uFlow;
uniform float uSpin;
uniform vec3 uPointer;
uniform vec2 uPointerVel;
uniform vec4 uShock;
uniform float uScroll;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
${NOISE}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }

// Where this particle belongs in each scene. s is four per-particle randoms, g the texel's grid position.
vec3 shape(int k, vec4 s, vec2 g, float index, float count, vec3 glyph) {
  float t = uTime;
  if (k == 0) return glyph;
  if (k == 1) {
    // Spoken waveform: dot bars whose heights move like syllables.
    float W = 3.3;
    float bar = 0.078;
    float bx = (floor((s.x - 0.5) * W / bar) + 0.5) * bar;
    float u = bx / W + 0.5;
    float win = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
    float amp = win * (0.1 + 0.9 * abs(sin(bx * 7.3 + t * 9.0) * sin(bx * 2.9 - t * 5.7 + 1.3)) * (0.3 + 0.7 * abs(sin(bx * 1.7 + t * 2.3))));
    return vec3(bx, (s.y * 2.0 - 1.0) * amp * 0.5, (s.z - 0.5) * 0.06);
  }
  if (k == 2) {
    // Voice orb: a globe of latitude rings, each swelling like a level meter as the voice moves through it.
    float rings = 46.0;
    float ring = floor(s.y * rings);
    float lat = ((ring + 0.5) / rings - 0.5) * 3.04;
    float lon = s.x * 6.2831853;
    float voice = abs(sin(ring * 0.37 + t * 3.1) * sin(ring * 0.11 - t * 1.7)) * (0.55 + 0.45 * sin(lon * 3.0 + t * 2.2));
    float rad = 1.0 + 0.16 * voice * cos(lat);
    vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)) * rad;
    p += (vec3(s.z, s.w, s.z * s.w) - 0.5) * 0.012;
    return rotX(rotY(p, t * uSpin), 0.32);
  }
  if (k == 3) {
    // Optimisation landscape: a dot-grid surface with two basins; 4% of particles trace a descent path.
    vec2 q = (g - 0.5) * 3.4;
    if (s.w < 0.04) {
      float a = fract(s.x + t * 0.08);
      vec2 start = vec2(1.45, -1.25);
      vec2 end = vec2(-0.72, 0.42);
      q = mix(start, end, 1.0 - pow(1.0 - a, 1.6)) + vec2(sin(a * 9.0), cos(a * 7.0)) * 0.14 * (1.0 - a);
    }
    float h = 0.42 * exp(-dot(q - vec2(0.7, -0.5), q - vec2(0.7, -0.5)) * 1.4)
            - 0.62 * exp(-dot(q - vec2(-0.72, 0.42), q - vec2(-0.72, 0.42)) * 1.8)
            - 0.25 * exp(-dot(q - vec2(0.9, 0.95), q - vec2(0.9, 0.95)) * 3.0)
            + 0.05 * sin(q.x * 3.0 + t * 0.6) * cos(q.y * 2.6 - t * 0.4);
    vec3 p = vec3(q.x, h + (s.w < 0.04 ? 0.03 : 0.0), q.y) * 0.62;
    return rotX(rotY(p, t * uSpin + 0.6), 0.62);
  }
  if (k == 4) {
    // Trefoil knot as a dotted tube: one closed loop, like a cyclic group. Dots circulate around the tube.
    float a = s.x * 6.2831853;
    vec3 c = vec3(sin(a) + 2.0 * sin(2.0 * a), cos(a) - 2.0 * cos(2.0 * a), -sin(3.0 * a)) * 0.34;
    vec3 T = normalize(vec3(cos(a) + 4.0 * cos(2.0 * a), -sin(a) + 4.0 * sin(2.0 * a), -3.0 * cos(3.0 * a)));
    vec3 Nn = normalize(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    vec3 B = cross(T, Nn);
    float phi = s.y * 6.2831853 + t * 0.8;
    vec3 p = c + (Nn * cos(phi) + B * sin(phi)) * 0.085 * mix(0.9, 1.1, s.w);
    return rotX(rotY(p, t * uSpin), 0.25);
  }
  if (k == 5) {
    // Galaxy: three arms, denser at the core, inner orbits faster.
    float r = pow(s.x, 0.65) * 2.3;
    float arm = floor(s.y * 3.0);
    float ang = arm * 2.0944 + r * 2.1 + (s.z - 0.5) * 0.9 / (r + 0.35) + t * 0.18 / (r + 0.6);
    vec3 p = vec3(cos(ang) * r, (s.w - 0.5) * 0.16 * (1.0 - r / 2.6), sin(ang) * r);
    return rotX(p, 1.08);
  }
  // Dust: a wide, slow volume behind the reading sections.
  return vec3((s.x - 0.5) * 9.0, (s.y - 0.5) * 5.5, (s.z - 0.5) * 4.0 - 0.6)
       + vec3(sin(t * 0.05 + s.w * 6.28), cos(t * 0.04 + s.x * 6.28), 0.0) * 0.35;
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, c, 0);
  vec4 V = texelFetch(uVel, c, 0);
  vec2 g = (vec2(c) + 0.5) / uSize;
  vec4 s = vec4(hash(g), hash(g + 17.31), hash(g + 41.97), hash(g + 73.13));
  float index = float(c.y) * uSize + float(c.x);
  vec3 target = shape(uShape, s, g, index, uSize * uSize, texelFetch(uTarget, c, 0).xyz);

  vec3 toT = target - P.xyz;
  float far = min(length(toT), 2.5);
  vec3 acc = toT * uSpring;
  acc += curl(P.xyz * 0.55 + vec3(0.0, uTime * 0.07, 0.0)) * uFlow * (0.12 + far);

  // The pointer pushes, swirls and drags particles in the screen plane.
  vec2 d = P.xy - uPointer.xy;
  float r2 = dot(d, d);
  float f = uPointer.z * exp(-r2 / 0.05);
  acc.xy += normalize(d + 1e-5) * f * 10.0 + vec2(-d.y, d.x) * f * 6.0 + uPointerVel * f * 3.0;

  // A click: one radial kick.
  vec2 sd = P.xy - uShock.xy;
  V.xy += normalize(sd + 1e-5) * uShock.z * exp(-dot(sd, sd) / uShock.w);

  acc.y += uScroll * (s.x - 0.5) * 3.0;
  V.xyz += acc * uDt;
  V.xyz *= exp(-uDrag * uDt);
  float sp = length(V.xyz);
  if (sp > 9.0) V.xyz *= 9.0 / sp;
  P.xyz += V.xyz * uDt;
  oPos = P;
  oVel = V;
}
`;

// Points: read position from the simulation, shade by depth, speed and edge.
export const POINTS_VERT = `#version 300 es
precision highp float;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uTarget;
uniform mat4 uMVP;
uniform vec2 uAnchor;
uniform float uScale;
uniform float uSize;
uniform float uFocus;
uniform float uIntensity;
uniform float uGlyph;
uniform int uGrid;
uniform vec3 uColor;
uniform vec3 uAccent;
uniform int uShape;
out vec3 vColor;
out float vAlpha;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  ivec2 c = ivec2(gl_VertexID % uGrid, gl_VertexID / uGrid);
  // Same seed the simulation uses, so the render knows which particles trace the descent path.
  vec2 g = (vec2(c) + 0.5) / float(uGrid);
  float path = (uShape == 3 && hash(g + 73.13) < 0.04) ? 1.0 : 0.0;
  vec3 P = texelFetch(uPos, c, 0).xyz;
  vec3 V = texelFetch(uVel, c, 0).xyz;
  float edge = texelFetch(uTarget, c, 0).w * uGlyph;
  vec4 clip = uMVP * vec4(P * uScale, 1.0);
  clip.xy += uAnchor * clip.w;
  gl_Position = clip;
  float h = fract(sin(float(gl_VertexID) * 12.9898) * 43758.5453);
  float blur = abs(clip.w - uFocus) / uFocus;
  float grow = 1.0 + blur * 5.0;
  float speed = length(V);
  float hot = smoothstep(1.4, 4.5, speed);
  gl_PointSize = min(48.0, uSize * (uFocus / clip.w) * mix(0.6, 1.3, h) * grow * mix(1.0, 0.82, edge));
  float tone = mix(mix(0.3, 0.72, h), 1.0, edge);
  vColor = mix(uColor, uAccent, max(path, hot * step(0.45, h)));
  vAlpha = uIntensity * (tone + hot * 0.5 + path * 1.5) / (grow * grow);
}
`;

export const POINTS_FRAG = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vAlpha;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.2, d) * vAlpha;
  if (a < 0.003) discard;
  o = vec4(vColor * a, a);
}
`;

// Multiplies what's already there by uKeep: motion trails while things move.
export const FADE = `#version 300 es
precision mediump float;
uniform float uKeep;
out vec4 o;
void main() { o = vec4(0.0, 0.0, 0.0, uKeep); }
`;

// Bright pass, downsampled.
export const BRIGHT = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 c = texture(uSrc, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.35, 1.2, l), 1.0);
}
`;

export const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 c = texture(uSrc, uv).rgb * 0.227027;
  c += texture(uSrc, uv + uDir * 1.3846153).rgb * 0.3162162;
  c += texture(uSrc, uv - uDir * 1.3846153).rgb * 0.3162162;
  c += texture(uSrc, uv + uDir * 3.2307692).rgb * 0.0702702;
  c += texture(uSrc, uv - uDir * 3.2307692).rgb * 0.0702702;
  o = vec4(c, 1.0);
}
`;

// Final image: ink + light on dark, or paper - ink on light; then grain and a soft vignette.
export const COMPOSITE = `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform vec3 uBg;
uniform float uLight;
uniform float uBloomGain;
uniform float uTime;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 light = texture(uScene, uv).rgb + texture(uBloom, uv).rgb * uBloomGain;
  light = light / (1.0 + light * 0.35);
  vec3 c = uLight > 0.5 ? uBg - light : uBg + light;
  vec2 q = uv - 0.5;
  c *= mix(1.0, 1.0 - dot(q, q) * 0.55, 1.0 - uLight);
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.028;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
