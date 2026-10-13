import type { Kit } from "./kit";

export interface FigureDef {
  loop: number; // seconds per story
  still: number; // the frame shown when motion is reduced
  // t is seconds into the current loop; round counts completed loops.
  draw(k: Kit, t: number, round: number): void;
}
