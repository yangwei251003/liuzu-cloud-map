import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("首页动效尊重系统减少动态设置且不受旧站内开关静默冻结", async () => {
  const home = await source("src/components/HomeReferenceExperience.tsx");
  assert.match(home, /useSystemReducedMotion\(\)/);
  assert.match(home, /const reduceMotion = systemReduceMotion/);
  assert.match(home, /whileInView=/);
  assert.match(home, /viewport=\{\{ once: true/);
});

test("推荐路线在窄屏使用稳定行高和独立披露间距", async () => {
  const styles = await source("src/components/HomeReferenceExperience.module.css");
  assert.match(styles, /grid-template-rows: repeat\(5, minmax\(4\.65rem, auto\)\)/);
  assert.match(styles, /grid-template-rows: auto auto auto/);
  assert.match(styles, /\.routeFooter\s*\{[^}]*padding-top:/s);
  assert.match(styles, /\.stopImage\s*\{[^}]*height: 4\.2rem/s);
});

test("地图标记与路线提供轻量动效并有减少动态降级", async () => {
  const [mapCss, amap] = await Promise.all([
    source("src/app/map/map-workspace.css"),
    source("src/components/AmapDetailedMap.tsx"),
  ]);
  assert.match(mapCss, /@keyframes map-marker-arrive/);
  assert.match(mapCss, /@keyframes map-route-trace/);
  assert.match(mapCss, /prefers-reduced-motion: reduce/);
  assert.match(amap, /const entranceAnimation = reducedMotion \? null : button\.animate/);
});

test("社区与聊天状态有反馈且不改变业务结构", async () => {
  const [social, assistant, globals] = await Promise.all([
    source("src/components/SocialCommunityExperience.module.css"),
    source("src/components/ChanxiaoliAssistant.tsx"),
    source("src/app/globals.css"),
  ]);
  assert.match(social, /social-reaction-confirm/);
  assert.match(social, /social-comments-open/);
  assert.match(assistant, /data-chat-typing/);
  assert.match(assistant, /data-chat-error/);
  assert.match(assistant, /data-chat-bubble/);
  assert.match(globals, /@keyframes chat-bubble-arrive/);
});
