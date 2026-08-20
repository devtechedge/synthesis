import { expect, test } from "@playwright/test";

test.describe("home idle chrome", () => {
  test("renders Synthesis shell and Idle badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Synthesis").first()).toBeVisible();
    await expect(page.getByTestId("status-badge")).toContainText("Idle");
    await expect(page.getByTestId("launch-research")).toBeVisible();
    await expect(page.getByTestId("brief-input")).toBeVisible();
  });

  test("Launch research is disabled until a brief is entered", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("launch-research")).toBeDisabled();
  });

  test("example chip fills the brief", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("example-prompt").first().click();
    const value = await page.getByTestId("brief-input").inputValue();
    expect(value.length).toBeGreaterThan(10);
    await expect(page.getByTestId("launch-research")).toBeEnabled();
  });
});
