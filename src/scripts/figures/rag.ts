// Hybrid RAG: keyword and vector search rank, Reciprocal Rank Fusion merges, a cross-encoder reorders.

import { ease, type Kit, lerp, span, VW } from "./kit";
import type { FigureDef } from "./types";

const QUERIES = [
  "refund window for a damaged item",
  "who approves a policy exception",
  "cancel an order after dispatch",
];

const LEXICAL = ["d07", "d02", "d11", "d04", "d09", "d01", "d12", "d05"];
const DENSE = ["d02", "d04", "d07", "d10", "d03", "d11", "d06", "d09"];

// Real RRF with the usual k = 60, over everything either list returned.
export const RRF_K = 60;
export function fuse(lists: string[][], k = RRF_K): { id: string; score: number }[] {
  const score = new Map<string, number>();
  for (const list of lists) {
    for (const [rank, id] of list.entries()) score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1));
  }
  return [...score.entries()].map(([id, s]) => ({ id, score: s })).sort((a, b) => b.score - a.score);
}

const FUSED = fuse([LEXICAL, DENSE]).slice(0, 8);
// The cross-encoder reads query and passage together and reorders the fused shortlist.
const RERANKED = ["d04", "d02", "d11", "d07", "d10", "d09", "d01", "d03"].filter((id) =>
  FUSED.some((f) => f.id === id),
);

const COL = { lex: 24, dense: 200, out: 392 };
const ROW0 = 92;
const ROW = 30;
const BAR = 92;

const rowY = (i: number) => ROW0 + i * ROW;

function source(k: Kit, x: number, title: string, list: string[], t: number): void {
  k.text(title, x, 66, { color: k.dim() });
  for (const [i, id] of list.entries()) {
    const show = ease.out(span(t, 0.2 + i * 0.12, 0.6 + i * 0.12));
    if (show <= 0) continue;
    const y = rowY(i);
    k.text(id, x, y + 4, { color: k.fg(show) });
    k.box(x + 36, y - 4, BAR, 8, k.rule());
    k.rect(x + 36, y - 4, BAR * (1 - i * 0.1) * show, 8, k.fg(0.55 + 0.45 * (1 - i / 8)));
  }
}

export const rag: FigureDef = {
  loop: 12,
  still: 7.4,
  draw(k, t, round) {
    const q = QUERIES[round % QUERIES.length] ?? "";
    const typed = q.slice(0, Math.floor(span(t, 0, 0.9) * q.length));
    k.chrome("hybrid retrieval / rank fusion", `q: ${typed}`);

    // Fusion: each fused document pulls a thread from wherever it ranked.
    const fuseT = span(t, 2.0, 4.2);
    const rerankT = ease.inOut(span(t, 4.8, 6.4));
    const sent = span(t, 6.5, 7.0) > 0;
    const title = sent ? "top 5 go to the LLM" : rerankT > 0 ? "cross-encoder rerank" : "reciprocal rank fusion";
    k.text(title, COL.out, 66, { color: rerankT > 0 ? k.accent() : k.dim() });

    for (const [fi, f] of FUSED.entries()) {
      const appear = ease.out(span(fuseT, fi * 0.08, 0.5 + fi * 0.06));
      if (appear <= 0) continue;
      const finalIndex = RERANKED.indexOf(f.id);
      const y = lerp(rowY(fi), rowY(finalIndex < 0 ? fi : finalIndex), rerankT);
      for (const [list, x] of [
        [LEXICAL, COL.lex],
        [DENSE, COL.dense],
      ] as const) {
        const r = list.indexOf(f.id);
        if (r < 0) continue;
        const sx = x + 36 + BAR + 6;
        const sy = rowY(r);
        const ex = COL.out - 8;
        const g = k.ctx;
        g.strokeStyle = k.fg(0.16 * appear * (1 - rerankT * 0.7));
        g.lineWidth = k.hair;
        g.beginPath();
        g.moveTo(sx, sy);
        g.bezierCurveTo(sx + 60, sy, ex - 60, y, ex, y);
        g.stroke();
        // A bead running down each thread while fusion happens.
        const s = (t * 0.6 + fi * 0.13 + r * 0.07) % 1;
        if (fuseT > 0 && fuseT < 1) {
          const m = 1 - s;
          const bx = m ** 3 * sx + 3 * m * m * s * (sx + 60) + 3 * m * s * s * (ex - 60) + s ** 3 * ex;
          const by = m ** 3 * sy + 3 * m * m * s * sy + 3 * m * s * s * y + s ** 3 * y;
          k.circle(bx, by, 1.5, k.fg(0.8));
        }
      }
      const top = rerankT >= 1 && finalIndex < 5;
      k.text(f.id, COL.out, y + 4, { color: k.fg(appear) });
      const w = (f.score / (FUSED[0]?.score ?? 1)) * 104 * appear;
      k.box(COL.out + 36, y - 4, 104, 8, k.rule());
      k.rect(COL.out + 36, y - 4, w, 8, top ? k.accent() : k.fg(0.8));
      if (!k.small) k.text(f.score.toFixed(4), VW - 18, y + 4, { align: "right", color: k.dim(appear), size: 9.5 });
    }

    // Bars over the threads, so the columns stay readable.
    source(k, COL.lex, "bm25", LEXICAL, t);
    source(k, COL.dense, "dense", DENSE, t);

    // Scanning line while the cross-encoder works.
    if (rerankT > 0 && rerankT < 1) {
      const sy = lerp(rowY(0) - 12, rowY(7) + 12, rerankT);
      k.line(COL.out - 6, sy, VW - 18, sy, k.accent(0.8));
    }

    // Top five go to the model.
    const bracket = ease.out(span(t, 6.5, 7.0));
    if (bracket > 0) {
      const x = COL.out - 14;
      const y0 = rowY(0) - 8;
      const y1 = lerp(y0, rowY(4) + 8, bracket);
      k.line(x, y0, x, y1, k.accent(), 1.4);
      k.line(x, y0, x + 4, y0, k.accent(), 1.4);
      k.line(x, y1, x + 4, y1, k.accent(), 1.4);
    }

    // Precision@5, before and after. The measured numbers from the project.
    const y = 352;
    k.line(18, y - 22, VW - 18, y - 22, k.rule());
    k.text("precision@5", 18, y - 2, { color: k.dim() });
    const grow = ease.out(span(t, 7.4, 9.0));
    for (const [i, row] of [
      { label: "cosine baseline", value: 0.68, color: k.fg(0.45) },
      { label: "hybrid + rerank", value: 0.84, color: k.accent() },
    ].entries()) {
      const ry = y + 22 + i * 34;
      const v = row.value * grow;
      k.text(row.label, 18, ry + 4, { color: i === 1 ? k.fg() : k.dim() });
      k.box(170, ry - 6, 330, 12, k.rule());
      k.rect(170, ry - 6, 330 * v, 12, row.color);
      k.text(v.toFixed(2), VW - 18, ry + 5, { align: "right", size: 13, color: i === 1 ? k.accent() : k.fg() });
    }
  },
};
