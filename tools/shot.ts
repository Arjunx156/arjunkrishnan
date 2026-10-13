// Real-time headless screenshots over the DevTools protocol. `--virtual-time-budget` crashes the GPU
// process on heavy WebGL, so this lets the page run at real speed instead.
// Usage: bun tools/shot.ts <url> <out.png> [--reduced] [--scroll <selector>] [--wait ms] [--size WxH]

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const [url, out] = args;
if (!url || !out)
  throw new Error("usage: bun tools/shot.ts <url> <out.png> [--reduced] [--scroll sel] [--wait ms] [--size WxH]");
const [width, height] = (flag("--size") ?? "1440x900").split("x").map(Number);
const wait = Number(flag("--wait") ?? 4000);
const scroll = flag("--scroll");
const chromePath = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9400 + Math.floor(Math.random() * 400);

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--hide-scrollbars",
    `--user-data-dir=${join(tmpdir(), "portfolio-shot")}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

interface Target {
  type: string;
  webSocketDebuggerUrl: string;
}
const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[];
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("shot: no page target");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map<number, (v: Record<string, unknown>) => void>();
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<Record<string, unknown>>((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (m) => {
  const d = JSON.parse(String(m.data)) as { id?: number; result?: Record<string, unknown> };
  if (d.id && pending.has(d.id)) pending.get(d.id)?.(d.result ?? {});
};
await new Promise((r) => {
  ws.onopen = r;
});

await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: (width ?? 0) < 700 });
if (args.includes("--reduced")) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
}
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(2500);
if (scroll) {
  await send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(scroll)})?.scrollIntoView({ block: "start", behavior: "instant" })`,
  });
}
await sleep(wait);
const shot = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
writeFileSync(out, Buffer.from(shot.data, "base64"));
ws.close();
chrome.kill();
process.exit(0);
