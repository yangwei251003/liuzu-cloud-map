import assert from "node:assert/strict";
import test from "node:test";
import { clearProjectCaches, clearProjectStorage } from "../src/lib/data-control.ts";

function storageWith(values, failingKey = "") {
  const keys = [...values];
  return {
    get length() { return keys.length; },
    key(index) { return keys[index] ?? null; },
    removeItem(key) {
      if (key === failingKey) throw new Error("blocked");
      const index = keys.indexOf(key);
      if (index >= 0) keys.splice(index, 1);
    },
  };
}

test("只清除六祖云游键，不碰同源其他产品数据", () => {
  const storage = storageWith([
    "liuzu-cloud-tour:journey:v1",
    "liuzu-cloud-tour:saved-knowledge:v1",
    "liuzu-cloud-tour:new-capability:v1",
    "liuzu-cloud-tour-progress-v1",
    "liuzu-journal-drafts",
    "another-product:session",
  ]);
  const result = clearProjectStorage(storage);

  assert.equal(result.supported, true);
  assert.deepEqual(new Set(result.removed), new Set([
    "liuzu-cloud-tour:journey:v1",
    "liuzu-cloud-tour:saved-knowledge:v1",
    "liuzu-cloud-tour:new-capability:v1",
    "liuzu-cloud-tour-progress-v1",
    "liuzu-journal-drafts",
  ]));
  assert.deepEqual(result.failed, []);
  assert.equal(storage.length, 1);
  assert.equal(storage.key(0), "another-product:session");
});

test("存储删除失败会逐项报告，不冒充全部成功", () => {
  const storage = storageWith(["liuzu-cloud-tour:journey:v1", "liuzu-checkins"], "liuzu-checkins");
  const result = clearProjectStorage(storage);

  assert.deepEqual(result.removed, ["liuzu-cloud-tour:journey:v1"]);
  assert.deepEqual(result.failed, ["liuzu-checkins"]);
});

test("只删除项目离线缓存并报告浏览器拒绝", async () => {
  const deleted = [];
  const result = await clearProjectCaches({
    keys: async () => ["liuzu-cloud-tour-v1", "liuzu-cloud-tour-v2", "another-cache"],
    delete: async (key) => {
      if (key === "liuzu-cloud-tour-v2") return false;
      deleted.push(key);
      return true;
    },
  });

  assert.deepEqual(deleted, ["liuzu-cloud-tour-v1"]);
  assert.deepEqual(result.removed, ["liuzu-cloud-tour-v1"]);
  assert.deepEqual(result.failed, ["liuzu-cloud-tour-v2"]);
});
