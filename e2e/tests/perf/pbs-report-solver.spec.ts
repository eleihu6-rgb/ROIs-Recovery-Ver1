import { test, expect } from "@playwright/test";

const REPORT_URL = "https://crew-f8-usva-uat.roiscloud.com/report/";

test("PBS Unit Test solver runs without path error", async ({ page }) => {
  await page.goto(REPORT_URL, { waitUntil: "networkidle" });

  // Open the gear "Switch page" dropdown and click Unit Test
  await page.locator('[aria-label="Switch page"]').click();
  await page.getByText("Unit Test", { exact: true }).click();
  await page.waitForTimeout(1000);

  // Select Test_1 scenario
  await page.getByText("Test_1", { exact: true }).first().click();
  await page.waitForTimeout(1000);

  // Run PBS Solver button should be visible
  const runBtn = page.getByRole("button", { name: /run pbs solver/i });
  await expect(runBtn).toBeVisible();
  await runBtn.click();

  // Wait for solver to complete (up to 90 seconds)
  await page.waitForFunction(
    () => !document.querySelector("button")?.textContent?.includes("Running"),
    { timeout: 90000 },
  );

  // Verify no Windows-path error appeared
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("D:\\");
  expect(bodyText).not.toContain("[Errno 2]");
  expect(bodyText).not.toContain("No such file or directory");

  // Verify solver produced results — Preference Summary table must have data rows
  await expect(page.getByText("Crews (3)")).toBeVisible();
  await expect(page.getByText("Preference Summary")).toBeVisible();
  // "Award" column appears only in the results table (solver actually ran and wrote result.json)
  await expect(page.getByText("Award").first()).toBeVisible();
});
