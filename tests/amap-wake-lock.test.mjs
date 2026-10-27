import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("站内导航在运行时申请屏幕常亮，并在所有暂停路径释放", async () => {
  const source = await readFile(
    new URL("../src/components/AmapEmbeddedNavigator.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /navigator\.wakeLock\.request\("screen"\)/);
  assert.match(source, /if \(wakeLockPreferredRef\.current\) void requestWakeLock\(\)/);
  assert.match(source, /const handlePause[\s\S]*?releaseWakeLock\(\)[\s\S]*?setPhase\("paused"\)/);
  assert.match(source, /const handleExit[\s\S]*?releaseWakeLock\(\)[\s\S]*?setPhase\("idle"\)/);
  assert.match(source, /const pauseForBackground[\s\S]*?releaseWakeLock\(\)[\s\S]*?setPhase\("paused"\)/);
  assert.match(source, /arrivalSamplesRef\.current >= ARRIVAL_SAMPLE_COUNT[\s\S]*?releaseWakeLock\(\)[\s\S]*?setPhase\("arrived"\)/);
  assert.match(source, /aria-label=\{wakeLockPreferred \? "关闭导航屏幕常亮" : "开启导航屏幕常亮"\}/);
});
