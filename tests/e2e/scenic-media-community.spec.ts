import { expect, test } from "@playwright/test";

test("首页景点实景与地图选点保持联动", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "在地图中查看六祖惠能故居" }).click();
  const communityLink = page.getByRole("link", { name: "看游客摄影" });
  await expect(communityLink).toHaveAttribute("href", "/community/huineng-residence");
  await expect(page.getByText("六祖惠能故居", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/区域环境照片不代表对应景点本体/)).toBeVisible();
});

test("游客可以发起地点话题与挑战", async ({ page }) => {
  await page.goto("/community");
  await expect(page.getByRole("heading", { name: "话题、挑战与主题活动" })).toBeVisible();
  await page.getByRole("button", { name: "发起互动" }).click();
  await page.getByRole("button", { name: "游玩挑战" }).click();
  await page.getByPlaceholder("给互动起一个吸引人的标题").fill("周末古建取景挑战");
  await page.getByPlaceholder("告诉大家如何参与").fill("拍下你最喜欢的一处屋脊细节，并分享取景时间与感受。");
  await page.getByRole("button", { name: "立即发布" }).click();
  await expect(page.getByRole("heading", { name: "周末古建取景挑战" })).toBeVisible();
  await expect(page.getByText("游玩挑战", { exact: true }).last()).toBeVisible();
});

test("运营页面可以发布社区主题活动", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "发布社区主题活动" })).toBeVisible();
});
