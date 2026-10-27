import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("首页 Hero 使用景区宣传轮播", async () => {
  const home = await source("src/components/HomeReferenceExperience.tsx");
  assert.match(home, /import \{ ScenicPromotionCarousel \}/);
  assert.match(home, /<ScenicPromotionCarousel className=\{styles\.heroMedia\} \/>/);
  assert.doesNotMatch(home, /<HeroJourneyMedia/);
});

test("宣传轮播具备混合媒体、手动控件和无障碍语义", async () => {
  const carousel = await source("src/components/ScenicPromotionCarousel.tsx");
  const styles = await source("src/components/ScenicPromotionCarousel.module.css");
  assert.match(carousel, /<video/);
  assert.match(carousel, /muted/);
  assert.match(carousel, /playsInline/);
  assert.match(carousel, /PROMOTION_ROTATION_MS/);
  assert.doesNotMatch(carousel, /\sloop(?:\s|>)/);
  assert.match(carousel, /onEnded=\{onVideoEnded\}/);
  assert.match(carousel, /activeItem\?\.kind === "image" && shouldAutoRotatePromotions/);
  assert.match(carousel, /上一张宣传内容/);
  assert.match(carousel, /下一张宣传内容/);
  assert.match(carousel, /暂停自动轮播/);
  assert.match(carousel, /aria-roledescription="轮播"/);
  assert.match(carousel, /const ariaLiveMode = autoRotating \? "off" : announcementMode/);
  assert.match(carousel, /aria-live=\{ariaLiveMode\}/);
  assert.match(carousel, /setAnnouncementMode\("off"\)/);
  assert.match(carousel, /setAnnouncementMode\("polite"\)/);
  assert.match(carousel, /playingVideoId === activeItem\.id \? "暂停当前视频" : "播放当前视频"/);
  assert.match(carousel, /visualRef\.current\?\.playVideo\(\)/);
  assert.match(carousel, /video\.play\(\)/);
  assert.doesNotMatch(carousel, /useSystemReducedMotion/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(carousel, /event\.key === "ArrowLeft"/);
  assert.doesNotMatch(carousel, /onMouseEnter/);
  assert.doesNotMatch(carousel, /onFocusCapture/);
});

test("切换宣传内容时仅重挂视觉层，控制按钮保持稳定焦点", async () => {
  const carousel = await source("src/components/ScenicPromotionCarousel.tsx");
  assert.doesNotMatch(carousel, /<div\s+key=\{activeItem\.id\}\s+className=\{styles\.slide\}/s);
  assert.match(carousel, /<PromotionVisual\s+key=\{activeItem\.id\}/s);
});

test("宣传媒体失败时切换为备用画面的真实披露并保留原计划来源", async () => {
  const carousel = await source("src/components/ScenicPromotionCarousel.tsx");
  assert.match(carousel, /item\.fallbackSrc/);
  assert.match(carousel, /onError/);
  assert.match(carousel, /静态备用画面/);
  assert.match(carousel, /画面暂未载入/);
  assert.match(carousel, /景区宣传专区/);
  assert.match(carousel, /visibleDisclosureLabel/);
  assert.match(carousel, /visibleSourceLabel/);
  assert.match(carousel, /原计划素材来源/);
  assert.match(carousel, /官方了解更多/);
});
