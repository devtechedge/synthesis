import { expect, test } from "@playwright/test";

test.describe("HITL plan path", () => {
  test("launching a brief pauses for human approval", async ({ page }) => {
    test.skip(
      !process.env.DATABASE_URL && !process.env.POSTGRES_URL,
      "Postgres not configured — UI smokes still run in home.spec.ts",
    );

    await page.goto("/");
    await page.getByTestId("example-prompt").first().click();
    await page.getByTestId("launch-research").click();

    await expect(page.getByTestId("status-badge")).toContainText(/Planning|Awaiting approval/, {
      timeout: 45_000,
    });
    await expect(page.getByTestId("approve-execute")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Plan ready/i)).toBeVisible();
  });
});
