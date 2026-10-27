import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式导航就地提供景区参数化离线包入口并在安装后重新载入", async () => {
  const [control, planner] = await Promise.all([
    readFile(new URL("../src/components/OfflinePackControl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/FormalNavigationPlanner.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(control, /scenicAreaId\?: string/);
  assert.match(control, /compact\?: boolean/);
  assert.match(control, /onInstalled\?: \(\) => void/);
  assert.match(control, /installFormalOfflinePack\(scenicAreaId/);
  assert.match(control, /onInstalled\?\.\(\)/);
  assert.match(control, /data-offline-pack-control=\{compact \? "navigation" : "settings"\}/);
  assert.match(planner, /<OfflinePackControl[\s\S]*?scenicAreaId=\{scenicAreaId\}[\s\S]*?compact[\s\S]*?onInstalled=\{\(\) => void loadSnapshot\(\)\}/);
  assert.match(planner, /if \(response\.status === 503\) \{\s*if \(await activateOfflineSnapshot\(\)\) return;/);
});
