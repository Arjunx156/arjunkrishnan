// Diffie-Hellman with a man in the middle, then the certificate that stops him. Told in six steps.

import { ease, type Kit, lerp, span, VW } from "./kit";
import type { FigureDef } from "./types";

const A = { x: 92, y: 168, name: "Alice", tag: "A" };
const B = { x: VW - 92, y: 168, name: "Bob", tag: "B" };
const M = { x: VW / 2, y: 292, name: "Mallory", tag: "M" };
const CA = { x: VW / 2, y: 84, name: "CA", tag: "CA" };

interface Step {
  at: number;
  caption: string;
}

export const STEPS: Step[] = [
  { at: 0.4, caption: "Alice sends g^a. Mallory catches it." },
  { at: 2.6, caption: "Mallory forwards her own g^c to Bob." },
  { at: 4.8, caption: "Bob replies with g^b. Alice gets Mallory's g^d." },
  { at: 7.0, caption: "Two session keys. Mallory holds both." },
  { at: 9.4, caption: "A CA signs Bob's key. The forgery fails at verify." },
  { at: 12.6, caption: "Authenticated: one key, nobody in between." },
];

function actor(k: Kit, p: { x: number; y: number; name: string; tag: string }, alpha: number, hot = false): void {
  k.circle(p.x, p.y, 20, k.rgb(k.pal.bg));
  k.ring(p.x, p.y, 20, hot ? k.accent(alpha) : k.fg(alpha), 1.3);
  k.text(p.tag, p.x, p.y + 5, {
    align: "center",
    sans: true,
    size: 14,
    weight: 700,
    color: hot ? k.accent(alpha) : k.fg(alpha),
  });
  k.text(p.name, p.x, p.y + 38, { align: "center", color: k.dim(alpha), size: 10 });
}

// A message in flight: a pill with g raised to something.
function packet(k: Kit, x: number, y: number, exp: string, hot: boolean, alpha = 1, signed = false): void {
  const w = signed ? 64 : 36;
  k.rect(x - w / 2, y - 10, w, 20, hot ? k.accent(alpha) : k.fg(alpha));
  const ink = k.rgb(k.pal.bg, alpha);
  const tw = k.power("g", exp, x - w / 2 + 8, y + 4, { color: ink, size: 11 });
  if (signed) k.text("+sig", x - w / 2 + 12 + tw, y + 4, { color: ink, size: 9.5 });
}

function fly(
  k: Kit,
  from: { x: number; y: number },
  to: { x: number; y: number },
  s: number,
  exp: string,
  hot: boolean,
  signed = false,
) {
  if (s <= 0 || s >= 1) return;
  const e = ease.inOut(s);
  packet(k, lerp(from.x, to.x, e), lerp(from.y, to.y, e), exp, hot, 1, signed);
}

function key(k: Kit, x: number, y: number, exp: string, hot: boolean, alpha: number): void {
  if (alpha <= 0) return;
  k.text("K = ", x - 24, y, { color: k.dim(alpha), size: 10.5, align: "right" });
  k.power("g", exp, x - 24, y, { color: hot ? k.accent(alpha) : k.fg(alpha), size: 11.5 });
}

export const exchange: FigureDef = {
  loop: 16,
  still: 8.2,
  draw(k, t) {
    const step = STEPS.reduce((n, s, i) => (t >= s.at ? i : n), 0);
    k.chrome(
      "diffie-hellman / man in the middle",
      `step ${step + 1} of ${STEPS.length}`,
      step >= 4 ? k.fg() : k.accent(),
    );

    const secure = ease.inOut(span(t, 9.0, 9.8));
    const clean = ease.inOut(span(t, 12.4, 13.2));
    const end = 1 - span(t, 15.4, 16);

    // Wires: the intended line, and the detour through Mallory.
    k.line(
      A.x + 22,
      A.y,
      B.x - 22,
      B.y,
      clean > 0 ? k.fg(0.85 * clean) : k.rule(),
      clean > 0 ? 1.4 : 1,
      clean > 0 ? undefined : [3, 5],
    );
    const detour = 1 - clean;
    k.line(A.x + 16, A.y + 12, M.x - 18, M.y - 8, k.fg(0.32 * detour));
    k.line(M.x + 18, M.y - 8, B.x - 16, B.y + 12, k.fg(0.32 * detour));

    // Certificate authority, once it matters.
    if (secure > 0) {
      k.line(CA.x - 20, CA.y + 6, A.x + 14, A.y - 16, k.fg(0.35 * secure), 1, [2, 4]);
      k.line(CA.x + 20, CA.y + 6, B.x - 14, B.y - 16, k.fg(0.35 * secure), 1, [2, 4]);
      actor(k, CA, secure);
      k.text("signs public keys", CA.x, CA.y - 30, { align: "center", color: k.dim(secure), size: 9.5 });
    }

    actor(k, A, end);
    actor(k, B, end);
    actor(k, M, (1 - clean * 0.7) * end, step >= 1 && step <= 4);

    // Public parameters, and the secret each party never sends.
    k.text("public: prime p, generator g", 18, 60, { color: k.dim(), size: 9.5 });
    k.text("secret a", A.x, A.y + 52, { align: "center", color: k.dim(0.8 * end), size: 9.5 });
    k.text("secret b", B.x, B.y + 52, { align: "center", color: k.dim(0.8 * end), size: 9.5 });
    k.text("secrets c, d", M.x, M.y + 52, { align: "center", color: k.dim(0.8 * (1 - clean) * end), size: 9.5 });

    // Steps 1 to 3: every public value goes through Mallory, and she swaps it.
    fly(k, A, M, span(t, 0.6, 2.2), "a", false);
    fly(k, M, B, span(t, 2.8, 4.4), "c", true);
    fly(k, B, M, span(t, 5.0, 6.0), "b", false);
    fly(k, M, A, span(t, 6.0, 7.0), "d", true);

    // Step 4: the keys that come out of it.
    const keys = ease.out(span(t, 7.0, 7.6)) * (1 - clean) * end;
    key(k, A.x + 24, A.y + 80, "ac", false, keys);
    key(k, B.x + 24, B.y + 80, "bd", false, keys);
    if (keys > 0) {
      k.text("holds both", M.x + 70, M.y - 4, { color: k.dim(keys), size: 9.5 });
      k.power("g", "ac", M.x + 70, M.y + 14, { color: k.accent(keys), size: 11.5 });
      k.power("g", "bd", M.x + 110, M.y + 14, { color: k.accent(keys), size: 11.5 });
    }

    // Step 5: Bob's key now travels signed; Mallory's swap can't carry a valid signature.
    fly(k, B, M, span(t, 9.6, 10.6), "b", false, true);
    const forged = span(t, 10.6, 11.6);
    if (forged > 0 && forged < 0.85) {
      const e = ease.inOut(forged / 0.85);
      packet(k, lerp(M.x, A.x, e), lerp(M.y, A.y, e), "d", true, 1, true);
    }
    const burst = span(t, 11.4, 12.4);
    if (burst > 0 && burst < 1) {
      const pts: number[] = [];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const r = 10 + ease.out(burst) * 46;
        pts.push(A.x + 40 + Math.cos(a) * r, A.y + 18 + Math.sin(a) * r * 0.7);
      }
      k.dots(pts, 1.6 * (1 - burst), k.accent());
    }
    const verdict = span(t, 11.4, 11.8) * (1 - clean);
    if (verdict > 0) k.text("verify(sig) = false", A.x - 18, A.y - 34, { color: k.accent(verdict), size: 10.5 });

    // Step 6: one honest key on both ends.
    if (clean > 0) {
      key(k, A.x + 24, A.y + 80, "ab", false, clean * end);
      key(k, B.x + 24, B.y + 80, "ab", false, clean * end);
      const s = (t * 0.5) % 1;
      k.circle(lerp(A.x + 24, B.x - 24, s), A.y, 2.4, k.fg(clean * end));
    }

    // Caption.
    const cap = STEPS[step];
    if (cap) {
      const y = 418;
      k.line(18, y - 22, VW - 18, y - 22, k.rule());
      k.text(`${step + 1}`, 18, y, { color: k.accent(end), size: 11 });
      k.text(cap.caption, 40, y, { sans: true, size: 13, weight: 500, color: k.fg(end) });
    }
  },
};
