import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("字体角色由本地变量字体与文化 Token 锁定", async () => {
  const [layout, globals, homeStyles, socialStyles, cloudFonts] = await Promise.all([
    source("src/app/layout.tsx"),
    source("src/app/globals.css"),
    source("src/components/HomeReferenceExperience.module.css"),
    source("src/components/SocialCommunityExperience.module.css"),
    source("src/components/FounderCloudFonts.tsx"),
  ]);
  assert.match(layout, /@fontsource-variable\/noto-sans-sc\/wght\.css/);
  assert.match(layout, /@fontsource-variable\/noto-serif-sc\/wght\.css/);
  assert.match(layout, /@fontsource\/lxgw-wenkai\/500\.css/);
  assert.match(layout, /@fontsource\/ma-shan-zheng\/chinese-simplified-400\.css/);
  assert.match(layout, /FounderCloudFonts/);
  assert.match(globals, /--font-ui:/);
  assert.match(globals, /--font-display:/);
  assert.match(globals, /--font-wenkai:/);
  assert.match(globals, /--font-brush:/);
  assert.match(globals, /--font-shangwei:/);
  assert.match(globals, /--font-chanqu:/);
  assert.match(globals, /--font-beiwei:/);
  assert.match(globals, /--font-qingke:/);
  assert.match(globals, /--font-xiukai:/);
  assert.match(globals, /--font-xingkai:/);
  assert.doesNotMatch(globals, /url\([^)]*\/fonts\/(?:fz-|hy-)/);
  assert.match(globals, /--culture-pattern:/);
  assert.match(homeStyles, /font-family: var\(--font-qingke\)/);
  assert.doesNotMatch(homeStyles, /font-family: var\(--font-founder-qingke\)/);
  assert.doesNotMatch(homeStyles, /font-family: var\(--font-founder-xingkai\)/);
  assert.match(homeStyles, /font-family: var\(--font-wenkai\)/);
  assert.match(socialStyles, /font-family: var\(--font-qingke\)/);
  assert.match(cloudFonts, /FZXKJW/);
  assert.match(cloudFonts, /FZQKBYSJW/);
  assert.match(cloudFonts, /NEXT_PUBLIC_FOUNDER_CLOUD_KEY/);
});

test("地域动效组件只使用 GPU 友好的揭示与装饰描边，并支持减少动态", async () => {
  const [motionSource, homeStyles, globals] = await Promise.all([
    source("src/components/motion/CulturalMotion.tsx"),
    source("src/components/HomeReferenceExperience.module.css"),
    source("src/app/globals.css"),
  ]);
  assert.match(motionSource, /useMotionPreference/);
  assert.match(motionSource, /CulturalPatternLayer/);
  assert.match(motionSource, /RouteDraw/);
  assert.match(homeStyles, /culture-route-draw/);
  assert.match(homeStyles, /prefers-reduced-motion: no-preference/);
  assert.match(globals, /scenic-marker-ripple/);
  assert.match(globals, /prefers-reduced-motion: reduce/);
});

test("全站动效系统具有分级、统一降级和非阻塞路由转场", async () => {
  const [system, preference, primitives, routeTransition, appFrame, audit, map] = await Promise.all([
    source("src/lib/motion-system.ts"),
    source("src/lib/use-motion-preference.ts"),
    source("src/components/motion/MotionPrimitives.tsx"),
    source("src/components/motion/RouteTransition.tsx"),
    source("src/components/AppFrame.tsx"),
    source("docs/motion-audit.md"),
    source("docs/motion-map.md"),
  ]);
  assert.match(system, /cinematic.*expressive.*utility/);
  assert.match(system, /motionDuration/);
  assert.match(system, /motionSpring/);
  assert.match(preference, /systemReduced \|\| simplifiedVisuals/);
  assert.match(primitives, /function Stagger/);
  assert.match(primitives, /function MaskReveal/);
  assert.match(primitives, /function MagneticAction/);
  assert.match(primitives, /function ParallaxLayer/);
  assert.match(primitives, /function AnimatedValue/);
  assert.match(routeTransition, /usePathname/);
  assert.match(appFrame, /tierForPath/);
  assert.match(audit, /全站动效审计/);
  assert.match(map, /全站动效实施矩阵/);
});

test("图片悬停呼吸仅在精细鼠标设备上运行，并尊重简洁显示", async () => {
  const styles = await source("src/app/experience-v3.css");
  assert.match(styles, /@keyframes v3-image-hover-breathe/);
  assert.match(styles, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(styles, /button:hover img\[alt\]/);
  assert.match(styles, /data-simplified-visuals="true".*animation: none/s);
});

test("字体审计、视觉地图和开发预览保持存在", async () => {
  const [audit, map, license, preview] = await Promise.all([
    source("docs/typography-audit.md"),
    source("docs/typography-map.md"),
    source("docs/font-license-status.md"),
    source("src/app/dev/typography/page.tsx"),
  ]);
  assert.match(audit, /页面.*区域.*当前字体/);
  assert.match(audit, /地图/);
  assert.match(map, /Cultural Display/);
  assert.match(map, /移动端/);
  assert.match(license, /方正宋刻本秀楷/);
  assert.match(license, /待授权/);
  assert.match(preview, /NODE_ENV/);
  assert.match(preview, /方正宋刻本秀楷简体/);
});
