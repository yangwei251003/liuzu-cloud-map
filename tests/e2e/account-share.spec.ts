import { expect, test } from "@playwright/test";

const visitor = {
  subject: "visitor:liuzu-town:6f7056a0-e415-4d46-92cf-c4e697809154",
  scenicAreaId: "liuzu-town",
  handle: "quiet_walker",
};

const shareId = "73eac2a4-5401-4c36-9648-b2580328ee3a";
const publicToken = "c".repeat(43);
const createdAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString();

test("account page degrades honestly when the runtime capability is disabled", async ({ page }) => {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "CAPABILITY_DISABLED", message: "游客跨设备账号服务尚未完成运行配置，请继续使用本机私有体验。", retryable: false } }),
    });
  });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "需要跨设备时，再登录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "账号能力尚未启用" })).toBeVisible();
  await expect(page.getByText(/本机路线、导览、印章与游记/)).toBeVisible();
});

test("account registration sends a normalized closed payload and never persists the passphrase", async ({ page }) => {
  let submitted: unknown = null;
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "需要游客账号会话。", retryable: false } }) });
  });
  await page.route("**/api/v1/auth/register", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, visitor, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }) });
  });
  await page.route("**/api/v1/auth/logout", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, state: "SIGNED_OUT" }) });
  });

  await page.goto("/account");
  await page.getByRole("button", { name: "建立账号" }).click();
  await page.getByLabel("账号名").fill(" Quiet_Walker ");
  await page.getByLabel("设置长口令").fill("a private phrase with length");
  await page.getByLabel("再次输入口令").fill("a private phrase with length");
  await page.getByRole("button", { name: "建立账号并登录" }).click();
  await expect(page.getByText("跨设备只读分享已可用")).toBeVisible();
  expect(submitted).toEqual({ scenicAreaId: "liuzu-town", handle: "quiet_walker", passphrase: "a private phrase with length" });
  const persisted = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(persisted).not.toContain("a private phrase with length");
  await page.getByRole("button", { name: "退出游客账号" }).click();
  await expect(page.getByRole("button", { name: "登录游客账号" })).toBeVisible();
});

test("signed-in journey creates and remotely revokes an opaque server share", async ({ page }) => {
  let createPayload: unknown = null;
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, visitor }) });
  });
  await page.route("**/api/v1/share-links", async (route) => {
    createPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 2,
        mode: "AUTHENTICATED_SERVER",
        shareId,
        shareToken: publicToken,
        createdAt,
        expiresAt,
        warning: "链接凭据只在当前页面内存中用于复制。",
      }),
    });
  });
  await page.route(`**/api/v1/share-links/${shareId}/revoke`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, state: "REVOKED", alreadyRevoked: false }) });
  });

  await page.goto("/journey");
  await expect(page.getByText("跨设备分享已启用 · quiet_walker")).toBeVisible();
  await page.getByRole("button", { name: "保存这条路线" }).click();
  await page.getByRole("button", { name: "分享路线寻源半日线" }).click();
  await expect(page.getByText(/使用游客账号 quiet_walker 创建跨设备服务端链接/)).toBeVisible();
  await page.getByRole("button", { name: "创建跨设备 7 天链接" }).click();
  await expect(page.getByText("跨设备 · 7 天内有效")).toBeVisible();
  expect(createPayload).toEqual(expect.objectContaining({ scenicAreaId: "liuzu-town", title: "寻源半日线" }));
  expect(JSON.stringify(createPayload)).not.toContain("note");
  const link = page.locator("#route-shares").getByRole("link", { name: "查看" });
  await expect(link).toHaveAttribute("href", new RegExp(`/share#${publicToken}$`));
  const persisted = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(persisted).not.toContain(publicToken);
  await page.getByRole("button", { name: "远程撤销" }).click();
  await page.getByRole("button", { name: "确认远程撤销" }).click();
  await expect(page.getByText("跨设备 · 已远程撤销")).toBeVisible();
});

test("server share viewer resolves an opaque fragment token by POST and fails closed after revocation", async ({ page }) => {
  let revoked = false;
  let resolvePayload: unknown = null;
  await page.route("**/api/v1/shared-routes/resolve", async (route) => {
    expect(route.request().method()).toBe("POST");
    resolvePayload = route.request().postDataJSON();
    if (revoked) {
      await route.fulfill({ status: 410, contentType: "application/json", body: JSON.stringify({ error: { code: "REVOKED", message: "该分享已失效。", retryable: false } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        state: "ACTIVE",
        shareId,
        scenicAreaId: "liuzu-town",
        route: { version: 1, title: "寻源半日线", duration: "3 小时", pace: "均衡", stops: [{ id: "guoen-temple", name: "国恩寺", verification: "候选点位" }] },
        createdAt,
        expiresAt,
      }),
    });
  });

  await page.goto(`/share#${publicToken}`);
  await expect(page.getByText("跨设备只读")).toBeVisible();
  await expect(page.getByRole("heading", { name: "寻源半日线" })).toBeVisible();
  await expect(page.getByText(/每次都会核对/)).toBeVisible();
  expect(resolvePayload).toEqual({ token: publicToken });
  await expect(page).toHaveURL(/\/share$/);
  revoked = true;
  await page.goto(`/share#${publicToken}`);
  await expect(page.getByRole("heading", { name: "分享者已撤销这条链接" })).toBeVisible();
});
