import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve("storybook-static");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { entries } = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
  const stories = Object.values(entries).filter((entry) => entry.type === "story");
  if (!stories.length) throw new Error("No built stories found");
  for (const story of stories) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`);
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.children.length > 0, undefined, { timeout: 15_000 });
    if (errors.length) throw new Error(`${story.id}: ${errors.join("; ")}`);
    await page.close();
  }
  console.log(`${stories.length} built Storybook stories rendered without JavaScript errors`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
