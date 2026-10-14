import { expect, test } from "@playwright/test";
import { DEMO, openAsset, openProject, session, signIn } from "./helpers";

test("clients can't open the members page and never see internal threads", async ({ page }) => {
  await signIn(page, DEMO.client);
  const workspaceUrl = page.url();
  const response = await page.goto(`${workspaceUrl}/members`);
  expect(response?.status()).toBe(403);

  await page.goto(workspaceUrl);
  await openProject(page);
  await openAsset(page, "Homepage");
  await expect(page.getByText("Double-check the Kyoto price")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /New version/ })).toHaveCount(0);
});

test("another account gets a 404 for the workspace", async ({ page }) => {
  await signIn(page, DEMO.owner);
  const workspaceUrl = page.url();

  await page.context().clearCookies();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Outsider");
  await page.getByLabel("Email").fill(`outsider-${Date.now()}@test.local`);
  await page.getByLabel("Password").fill("outsider-password-1");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/onboarding/);

  const response = await page.goto(workspaceUrl);
  expect(response?.status()).toBe(404);
});

test("a revoked share link stops working, and guests can't approve", async ({ browser }) => {
  const owner = await session(browser, DEMO.owner);
  await openProject(owner);
  await owner.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Settings" }).click();
  await owner.getByRole("button", { name: /New share link/ }).click();
  await owner.getByLabel(/View and comment/).check();
  await owner.getByRole("button", { name: "Create link" }).click();
  const shareUrl = await owner.getByRole("textbox", { name: "Share link", exact: true }).inputValue();
  await owner.keyboard.press("Escape");

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(shareUrl);
  await guest.getByRole("link", { name: "Homepage" }).click();
  await expect(guest.getByRole("tab", { name: /^Open/ })).toBeVisible();
  await guest.getByRole("tab", { name: "Review" }).click();
  await expect(guest.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await expect(guest.getByText("Double-check the Kyoto price")).toHaveCount(0);

  await owner.reload();
  await owner.getByRole("button", { name: "Revoke" }).first().click();
  await expect(owner.getByText("Revoked").first()).toBeVisible();
  await guest.goto(shareUrl);
  await expect(guest.getByText("This link isn't available")).toBeVisible();
});
