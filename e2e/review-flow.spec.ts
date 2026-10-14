import { expect, test } from "@playwright/test";
import { DEMO, openAsset, openProject, placePin, screenshotPng, session } from "./helpers";

/**
 * The portfolio walkthrough, in two browsers: the designer uploads, the
 * client pins a comment, the designer sees it live, replies and resolves,
 * uploads V2, and the client compares and approves. The decision shows up in
 * the activity history.
 */
test("designer and client complete a review in two browsers", async ({ browser }) => {
  const designer = await session(browser, DEMO.designer);
  const client = await session(browser, DEMO.client);

  // Designer uploads a new screenshot through the dropzone.
  await openProject(designer);
  await designer.getByLabel("Choose images to upload").setInputFiles({
    name: "landing-page.png",
    mimeType: "image/png",
    buffer: await screenshotPng("Landing V1", "#f1f5f9"),
  });
  await expect(designer.getByText("Uploaded as V1", { exact: true })).toBeVisible();
  await expect(designer.getByRole("link", { name: "landing page", exact: true })).toBeVisible();

  // Both open it; the designer asks the client to review.
  await openAsset(designer, "landing page");
  await openProject(client);
  await openAsset(client, "landing page");

  // Client pins a comment on the button.
  await placePin(client, 0.2, 0.43);
  await client.getByRole("textbox", { name: "New comment" }).fill("Make this button say “Book now”.");
  await client.getByRole("button", { name: "Comment", exact: true }).last().click();
  await expect(client.getByRole("region", { name: "New comment" })).toHaveCount(0);

  // Designer sees it without reloading.
  const thread = designer.locator("button[id^=thread-]", { hasText: "Make this button say" });
  await expect(thread).toBeVisible();
  await expect(designer.getByRole("button", { name: /^Comment 1 by Sara Ahmed/ })).toBeVisible();

  // Designer replies and resolves.
  await thread.click();
  await designer.getByRole("textbox", { name: /Reply to thread/ }).fill("Done in V2.");
  await designer.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(client.locator("button[id^=thread-]", { hasText: "Make this button say" })).toContainText("1 reply");
  await designer.getByRole("button", { name: "Resolve" }).click();
  await expect(client.getByRole("tab", { name: "Resolved (1)" })).toBeVisible();

  // Designer uploads V2.
  await designer.getByRole("button", { name: /New version/ }).click();
  await designer.getByRole("dialog").locator("input[type=file]").setInputFiles({
    name: "landing-page-v2.png",
    mimeType: "image/png",
    buffer: await screenshotPng("Landing V2", "#fff7ed"),
  });
  await designer.getByLabel("What changed? (optional)").fill("Button copy changed to Book now.");
  await designer.getByRole("button", { name: "Upload V2" }).click();
  await designer.waitForURL(/version=/);
  await expect(designer.getByRole("combobox", { name: "Version" })).toHaveText(/V2/);

  // Designer requests review from the client on V2.
  await designer.getByRole("tab", { name: "Review" }).click();
  await designer.getByLabel("Designated approver").click();
  await designer.getByRole("option", { name: /Sara Ahmed/ }).click();
  await designer.getByRole("button", { name: "Request review" }).click();
  await expect(designer.getByText("Waiting on")).toBeVisible();

  // Client compares V1 and V2, then approves V2.
  await client.reload();
  await client.getByRole("link", { name: /Compare/ }).click();
  await expect(client.getByRole("region", { name: "Version 1" })).toBeVisible();
  await expect(client.getByRole("region", { name: "Version 2" })).toBeVisible();
  await client.getByRole("link", { name: "Back to review" }).click();
  await client.getByRole("tab", { name: "Review" }).click();
  await client.getByRole("button", { name: "Approve V2" }).click();
  await client.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(client.getByText("This version is approved")).toBeVisible();

  // The designer sees the approval live, and it is in the activity history.
  await expect(designer.getByText("This version is approved")).toBeVisible();
  await designer.getByRole("link", { name: /^Back to / }).click();
  await designer.waitForURL(/\/projects\/[a-z0-9]+$/);
  await designer.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Activity" }).click();
  await expect(designer.getByText("approved landing page V2")).toBeVisible();
});
