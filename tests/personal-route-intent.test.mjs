import assert from "node:assert/strict";
import test from "node:test";
import { interpretPersonalRoutePrompt } from "../src/lib/personal-route-intent.ts";
import { buildPersonalRoute } from "../src/lib/personal-route-builder.ts";

test("一句话路线识别时长、轻松节奏、长辈与核心兴趣", () => {
  const result = interpretPersonalRoutePrompt("带父母玩3小时，希望轻松不累，喜欢历史、自然和摄影");
  assert.deepEqual(result, {
    ok: true,
    input: {
      duration: "3小时",
      pace: "轻松",
      companion: "长辈同行",
      interests: ["历史", "自然", "摄影", "休闲放松"],
    },
    inferred: [],
  });
  if (!result.ok) return;
  assert.equal(buildPersonalRoute(result.input).ok, true);
});

test("亲子摄影需求生成可进入逐站导航的候选路线", () => {
  const intent = interpretPersonalRoutePrompt("半天亲子游，带孩子拍照和互动体验");
  assert.equal(intent.ok, true);
  if (!intent.ok) return;
  assert.equal(intent.input.duration, "半天");
  assert.equal(intent.input.companion, "亲子");
  assert.ok(intent.input.interests.includes("摄影"));
  assert.ok(intent.input.interests.includes("亲子"));
  const route = buildPersonalRoute(intent.input);
  assert.equal(route.ok, true);
  if (route.ok) assert.match(route.plan.legacyGuideHref, /^\/guide\?demo=1&stops=/);
});

test("信息缺省时显式披露推断，过短时长拒绝多站路线", () => {
  const inferred = interpretPersonalRoutePrompt("想看看古迹");
  assert.equal(inferred.ok, true);
  if (inferred.ok) {
    assert.equal(inferred.input.duration, "3小时");
    assert.equal(inferred.input.pace, "均衡");
    assert.match(inferred.inferred.join("；"), /3 小时/);
  }
  assert.deepEqual(interpretPersonalRoutePrompt("我只有1小时"), {
    ok: false,
    error: "当前逐站路线至少需要 2 小时；可以改为单个景点导航，或把时间调整为 2 小时以上。",
  });
});
