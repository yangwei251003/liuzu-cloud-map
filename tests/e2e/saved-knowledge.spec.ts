import { expect, test } from "@playwright/test";

test("a sourced AI answer saves as a private reference card without retaining answer prose", async ({ page }) => {
  const question = "国恩寺的文保身份是什么？";
  const answerProse = "这是仅用于浏览器验收的回答正文，不应出现在知识卡页面。";
  await page.route("**/api/ai-guide", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "e2e-knowledge-1",
        answer: answerProse,
        claims: [{ text: `${answerProse}[LZ-003]`, sourceIds: ["LZ-003"], factTypes: ["historical_record"] }],
        factTypes: ["historical_record"],
        sources: [{
          id: "LZ-003",
          title: "第八批全国重点文物保护单位名单",
          publisher: "国务院",
          url: "https://www.gov.cn/zhengce/content/2019-10/16/content_5440577.htm",
          checkedAt: "2026-08-14",
          evidenceLevel: "A",
          factType: "historical_record",
          reviewStatus: "PROJECT_SOURCE_CHECKED",
          sourceStatus: "OFFICIAL_PRIMARY",
        }],
        provider: "local-knowledge",
        verification: "verified-context",
        refused: false,
        generatedAt: "2026-08-15T01:00:00.000Z",
        notice: "项目已核对来源，未经专业终审。",
      }),
    });
  });

  await page.goto("/guide/ask?spot=guoen-temple");
  await page.getByLabel("你想了解什么？").fill(question);
  await page.getByRole("button", { name: "向禅小荔提问" }).click();
  await expect(page.getByText(answerProse)).toBeVisible();
  await page.getByRole("button", { name: "保存来源卡片" }).click();
  await expect(page.getByText(/没有保存 AI 回答全文/)).toBeVisible();
  await page.getByRole("link", { name: "查看我的知识卡" }).click();

  await expect(page).toHaveURL(/\/journey\/knowledge$/);
  await expect(page.getByRole("heading", { name: question })).toBeVisible();
  await expect(page.getByText("国务院 · 来源核验 2026-08-14")).toBeVisible();
  await expect(page.getByText(answerProse)).toHaveCount(0);
  await expect(page.getByText(/卡片不证明来源仍有效/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `删除知识卡：${question}` }).click();
  await expect(page.getByRole("heading", { name: "还没有保存知识卡" })).toBeVisible();
});
