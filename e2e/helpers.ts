import { expect, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

export const DEMO = {
  owner: "owner@demo.reviewspace.test",
  designer: "designer@demo.reviewspace.test",
  client: "client@demo.reviewspace.test",
  password: "reviewspace-demo",
};

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/w\//);
}

/** A separate browser session (its own cookies), signed in as `email`. */
export async function session(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

export async function openProject(page: Page, name = "Travel Website Redesign") {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL(/\/projects\/[a-z0-9]+/);
}

export async function openAsset(page: Page, name: string) {
  await page.getByRole("link", { name, exact: true }).first().click();
  await page.waitForURL(/\/assets\//);
  await expect(page.getByRole("tab", { name: /^Open \(\d+\)$/ })).toBeVisible();
}

/** Clicks the image at a fraction of its rendered size, in comment mode. */
export async function placePin(page: Page, fx: number, fy: number) {
  await page.getByRole("toolbar", { name: "Image tools" }).getByRole("button", { name: "Comment", exact: true }).click();
  const box = (await page.locator("main img").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

export async function screenshotPng(label: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/><text x="80" y="160" font-size="72" font-family="Arial" fill="#111">${label}</text><rect x="80" y="300" width="320" height="90" rx="45" fill="#ea580c"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
