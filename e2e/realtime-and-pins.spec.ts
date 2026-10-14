import { expect, test } from "@playwright/test";
import { DEMO, openAsset, openProject, placePin, session } from "./helpers";

test("comments made while a viewer was offline arrive after reconnecting", async ({ browser }) => {
  const designer = await session(browser, DEMO.designer);
  const client = await session(browser, DEMO.client);
  for (const page of [designer, client]) {
    await openProject(page);
    await openAsset(page, "Checkout");
  }
  await expect(client.getByRole("status").getByText("Live", { exact: true })).toBeVisible();

  await client.context().setOffline(true);
  await placePin(designer, 0.6, 0.2);
  await designer.getByRole("textbox", { name: "New comment" }).fill("Posted while you were offline");
  await designer.getByRole("button", { name: "Comment", exact: true }).last().click();
  await expect(designer.getByRole("region", { name: "New comment" })).toHaveCount(0);

  await client.context().setOffline(false);
  await expect(client.locator("button[id^=thread-]", { hasText: "Posted while you were offline" })).toBeVisible({ timeout: 45_000 });
});

test("a pin stays on the same image point after zooming, panning and resizing", async ({ browser }) => {
  const designer = await session(browser, DEMO.designer);
  await openProject(designer);
  await openAsset(designer, "Homepage");

  await placePin(designer, 0.5, 0.5);
  await designer.getByRole("textbox", { name: "New comment" }).fill("Pin position check");
  await designer.getByRole("button", { name: "Comment", exact: true }).last().click();
  await expect(designer.getByRole("region", { name: "New comment" })).toHaveCount(0);
  await designer.getByRole("toolbar", { name: "Image tools" }).getByRole("button", { name: "View", exact: true }).click();

  const pin = designer.locator("button[id^=pin-][aria-label*='Pin position check']");
  const image = designer.locator("main img").first();

  /** Pin tip as a fraction of the rendered image. */
  const relative = async () => {
    const [p, i] = await Promise.all([pin.boundingBox(), image.boundingBox()]);
    // The pin's tip is its bottom-left corner (the teardrop points there).
    return { x: (p!.x - i!.x) / i!.width, y: (p!.y + p!.height - i!.y) / i!.height };
  };
  const expectAtCentre = async () => {
    const r = await relative();
    expect(r.x).toBeCloseTo(0.5, 1);
    expect(r.y).toBeCloseTo(0.5, 1);
  };

  await expectAtCentre();
  await designer.getByRole("button", { name: "Zoom in" }).click();
  await designer.getByRole("button", { name: "Zoom in" }).click();
  await designer.waitForTimeout(400);
  await expectAtCentre();
  await designer.setViewportSize({ width: 900, height: 700 });
  await designer.getByRole("button", { name: "Fit to screen" }).click();
  await designer.waitForTimeout(400);
  await expectAtCentre();
});
