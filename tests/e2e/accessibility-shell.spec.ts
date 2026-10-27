import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("全站任务导航与辅助设置可持久化并恢复焦点", async ({ page }) => {
  await page.goto("/");

  const taskNav = page.getByRole("navigation", { name: "移动端主导航" });
  await expect(taskNav.getByRole("link")).toHaveCount(5);
  await expect(taskNav.getByRole("link", { name: "首页" })).toHaveAttribute("aria-current", "page");
  await expect(taskNav.getByRole("link", { name: "社区" })).toHaveAttribute("href", "/community");

  const trigger = page.getByRole("button", { name: "打开显示与辅助设置" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "显示与辅助" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "较大" }).click();
  await dialog.getByLabel("增强对比度").check();
  await dialog.getByLabel("简洁显示与标准地图").check();
  await dialog.getByLabel("全局静音").check();
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "large");
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
  await expect(page.locator("html")).toHaveAttribute("data-simplified-visuals", "true");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "large");
  await expect(page.locator("html")).toHaveAttribute("data-muted", "true");
});

test("路线生成器使用模态焦点边界并回到触发按钮", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "生成我的路线" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "今天想怎么逛？" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "关闭路线生成器" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
