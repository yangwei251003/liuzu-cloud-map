import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHANXIAOLI_ASSETS,
  CHANXIAOLI_HISTORY_LIMIT,
  CHANXIAOLI_LONG_PRESS_MS,
  appendChanxiaoliHistory,
  classifyChanxiaoliPointerIntent,
  denormalizeAssistantPosition,
  normalizeAssistantPosition,
  parseChanxiaoliAssistantData,
  readChanxiaoliAssistantData,
  writeChanxiaoliAssistantData,
} from "../src/lib/chanxiaoli-assistant.ts";
import { decideHeroMedia, resolveHeroPlayback } from "../src/lib/hero-media.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function historyItem(id) {
  return {
    id,
    question: `问题 ${id}`,
    answer: `回答 ${id}`,
    sourceLabels: ["[LZ-001] 官方来源"],
    refused: false,
    createdAt: new Date(1_700_000_000_000 + Number(id) * 1_000).toISOString(),
  };
}

test("禅小荔本机状态严格校验且不会接收额外字段", () => {
  const valid = {
    version: 1,
    position: { xRatio: 0.25, yRatio: 0.75 },
    dock: "left",
    muted: true,
    history: [historyItem("1")],
  };
  assert.deepEqual(parseChanxiaoliAssistantData(valid), valid);
  assert.equal(parseChanxiaoliAssistantData({ ...valid, secret: "no" }), null);
  assert.equal(parseChanxiaoliAssistantData({ ...valid, position: { xRatio: 2, yRatio: 0 } }), null);
});

test("问答历史去重并限制为最近 24 条", () => {
  let history = [];
  for (let index = 0; index < 30; index += 1) history = appendChanxiaoliHistory(history, historyItem(String(index)));
  assert.equal(history.length, CHANXIAOLI_HISTORY_LIMIT);
  assert.equal(history[0].id, "6");
  history = appendChanxiaoliHistory(history, { ...historyItem("12"), answer: "替换后的回答" });
  assert.equal(history.length, CHANXIAOLI_HISTORY_LIMIT);
  assert.equal(history.at(-1).answer, "替换后的回答");
});

test("损坏存储安全降级，正常存储可往返", () => {
  const broken = readChanxiaoliAssistantData({ getItem: () => "not-json" });
  assert.equal(broken.data.history.length, 0);
  assert.match(broken.error, /损坏/);

  let raw = "";
  const data = { version: 1, position: null, dock: "none", muted: false, history: [historyItem("3")] };
  assert.equal(writeChanxiaoliAssistantData(data, { setItem: (_key, value) => { raw = value; } }), true);
  const restored = readChanxiaoliAssistantData({ getItem: () => raw });
  assert.deepEqual(restored.data, data);
});

test("位置按视口比例保存并可恢复", () => {
  const normalized = normalizeAssistantPosition(446, 567.8, 1_000, 800, 108, 132);
  assert.deepEqual(normalized, { xRatio: 0.5, yRatio: 0.85 });
  assert.deepEqual(denormalizeAssistantPosition(normalized, 1_000, 800, 108, 132), { x: 446, y: 567.8 });
});

test("角色本体手势在单击、长按语音和拖动之间有明确门槛", () => {
  assert.equal(classifyChanxiaoliPointerIntent({ durationMs: CHANXIAOLI_LONG_PRESS_MS - 1, movementPx: 0 }), "click");
  assert.equal(classifyChanxiaoliPointerIntent({ durationMs: CHANXIAOLI_LONG_PRESS_MS, movementPx: 0 }), "voice");
  assert.equal(classifyChanxiaoliPointerIntent({ durationMs: CHANXIAOLI_LONG_PRESS_MS + 200, movementPx: 9 }), "drag");
});

test("Hero 在减少动态、节省流量和慢网时默认暂停播放器", () => {
  assert.deepEqual(decideHeroMedia({ reducedMotion: true }), { playVideo: false, reason: "reduced-motion" });
  assert.deepEqual(decideHeroMedia({ reducedMotion: false, connection: { saveData: true } }), { playVideo: false, reason: "save-data" });
  assert.deepEqual(decideHeroMedia({ reducedMotion: false, connection: { effectiveType: "2g" } }), { playVideo: false, reason: "slow-network" });
  assert.deepEqual(decideHeroMedia({ reducedMotion: false, connection: { effectiveType: "4g" } }), { playVideo: true, reason: "video" });
});

test("Hero 手动播放可以覆盖减少动态或节流暂停，但媒体错误保持失败关闭", () => {
  const reduced = decideHeroMedia({ reducedMotion: true });
  assert.equal(resolveHeroPlayback({ decision: reduced, preference: "auto" }), false);
  assert.equal(resolveHeroPlayback({ decision: reduced, preference: "play" }), true);
  assert.equal(resolveHeroPlayback({ decision: { playVideo: true, reason: "video" }, preference: "pause" }), false);
  assert.equal(resolveHeroPlayback({ decision: reduced, preference: "play", playbackFailed: true }), false);
});

test("公开版不打包未知授权角色和旧视频，保留文本向导与原创动效", async () => {
  for (const src of Object.values(CHANXIAOLI_ASSETS)) {
    await assert.rejects(readFile(path.join(appRoot, "public", src.replace(/^\//, ""))), { code: "ENOENT" });
  }
  const source = await readFile(path.join(appRoot, "src/components/ChanxiaoliAssistant.tsx"), "utf8");
  assert.match(source, /public-guide-avatar/);
  assert.doesNotMatch(source, /src=\{CHANXIAOLI_ASSETS/);
  const hero = await readFile(path.join(appRoot, "public/assets/hero/public/cloud-loop.mp4"));
  assert.ok(hero.length > 0);
});
