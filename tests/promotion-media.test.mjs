import assert from "node:assert/strict";
import test from "node:test";
import {
  PROMOTION_MEDIA_ITEMS,
  PROMOTION_ROTATION_MS,
  promotionStaticReason,
  shouldAutoRotatePromotions,
  wrapPromotionIndex,
} from "../src/lib/promotion-media.ts";

test("宣传媒体仅选择开放许可实景并排除未知权利视频", () => {
  assert.equal(PROMOTION_MEDIA_ITEMS.length, 4);
  assert.equal(PROMOTION_MEDIA_ITEMS.filter((item) => item.kind === "video").length, 0);
  assert.equal(PROMOTION_MEDIA_ITEMS.filter((item) => item.relation === "EXACT_SPOT").length, 1);
  assert.equal(PROMOTION_MEDIA_ITEMS.filter((item) => item.relation === "REGIONAL_CONTEXT").length, 3);
  assert.equal(PROMOTION_MEDIA_ITEMS.some((item) => item.src.includes("/promotions/") || item.src.includes("hero-ai")), false);
  assert.equal(PROMOTION_ROTATION_MS, 4_000);

  for (const item of PROMOTION_MEDIA_ITEMS) {
    assert.ok(item.fallbackSrc.startsWith("/assets/"));
    assert.ok(item.disclosure.length > 0);
    assert.ok(item.sourceLabel.length > 0);
    assert.ok(item.licenseLabel.length > 0);
    assert.match(item.officialReferenceHref, /^https:\/\/(?:www\.)?(?:yunfu|xinxing)\.gov\.cn\//);
  }
});

test("只有国恩寺使用精确实景，区域照片不可冒充其他景点", () => {
  const exactImages = PROMOTION_MEDIA_ITEMS.filter((item) => item.relation === "EXACT_SPOT");
  assert.equal(exactImages.length, 1);
  assert.ok(exactImages[0].title.includes("国恩寺"));
  assert.equal(exactImages[0].licenseLabel, "CC BY-SA 4.0");
  const context = PROMOTION_MEDIA_ITEMS.filter((item) => item.relation === "REGIONAL_CONTEXT");
  assert.equal(context.length, 3);
  assert.ok(context.every((item) => item.disclosureLabel.includes("非本景点")));
});

test("未知授权纪实视频不公开，官方参考链接不被当作照片授权", () => {
  assert.equal(PROMOTION_MEDIA_ITEMS.some((item) => item.id === "guoen-temple-documentary"), false);
  const item = PROMOTION_MEDIA_ITEMS.find((item) => item.id === "guoen-temple-licensed");
  assert.equal(item.officialReferenceHref, "https://www.yunfu.gov.cn/zjyf/lyyf/msfj/content/post_1582810.html");
  assert.match(item.sourceHref, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
});

test("轮播索引首尾循环", () => {
  assert.equal(wrapPromotionIndex(8, 8), 0);
  assert.equal(wrapPromotionIndex(-1, 8), 7);
  assert.equal(wrapPromotionIndex(2, 0), 0);
});

test("省流量与慢网进入静态模式", () => {
  assert.equal(promotionStaticReason({
    connection: { saveData: true },
  }), "save-data");
  assert.equal(promotionStaticReason({
    connection: { effectiveType: "2g" },
  }), "slow-network");
});

test("自动轮播在暂停、交互、隐藏或静态模式下停止", () => {
  const base = {
    itemCount: 8,
    userPaused: false,
    documentHidden: false,
    staticReason: null,
  };
  assert.equal(shouldAutoRotatePromotions(base), true);
  assert.equal(shouldAutoRotatePromotions({ ...base, userPaused: true }), false);
  assert.equal(shouldAutoRotatePromotions({ ...base, documentHidden: true }), false);
  assert.equal(shouldAutoRotatePromotions({ ...base, staticReason: "save-data" }), false);
});
