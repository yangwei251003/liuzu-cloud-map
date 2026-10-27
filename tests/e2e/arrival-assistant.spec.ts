import { expect, test } from "@playwright/test";

test("arrival assistant separates published evidence from today's unknown status", async ({ page }) => {
  await page.goto("/arrival");
  await expect(page.getByRole("heading", { name: /先找到正确范围/ })).toBeVisible();
  await expect(page.getByText("今天的状态仍需确认")).toBeVisible();

  await page.getByRole("tab", { name: "高铁到新兴南站" }).click();
  await expect(page.getByText(/没有今天的班次数据/)).toBeVisible();
  await expect(page.getByText("接驳是否运行")).toBeVisible();
  await expect(page.getByText("[LZ-015]")).toBeVisible();
  await expect(page.getByText(/不能作为今天的公交时刻表/)).toBeVisible();

  const checks = page.getByRole("checkbox");
  await expect(checks).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const checkbox = checks.nth(index);
    await checkbox.locator("..").click();
    await expect(checkbox).toBeChecked();
  }
  await expect(page.getByRole("status")).toContainText("已逐项自行确认");

  await page.getByRole("tab", { name: "已经在六祖镇周边" }).click();
  await expect(page.getByText(/不能默认连续步行可达/).first()).toBeVisible();
  await expect(page.getByText("0/4")).toBeVisible();
});

test("mobile home exposes arrival as a primary task", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "移动端主导航" }).getByRole("link")).toHaveCount(5);
  await page.getByRole("link", { name: "新兴导览" }).click();
  await expect(page).toHaveURL(/\/arrival$/);
});
