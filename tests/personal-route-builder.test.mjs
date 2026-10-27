import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONAL_ROUTE_RECOMMENDATIONS,
  buildPersonalRoute,
  buildRecommendedPersonalRoute,
} from "../src/lib/personal-route-builder.ts";

const customInput = {
  duration: "3小时",
  pace: "深度",
  companion: "独自",
  interests: ["禅文化", "人物故事"],
};

test("personal route generation is deterministic and preserves prototype boundaries", () => {
  const first = buildPersonalRoute(customInput);
  const second = buildPersonalRoute(structuredClone(customInput));

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  assert.equal(first.plan.status, "DEMO_ONLY");
  assert.equal(first.plan.totalDwellMinutes, first.plan.stops.reduce((sum, stop) => sum + stop.dwellMinutes, 0));
  assert.ok(first.plan.totalDwellMinutes <= first.plan.availableMinutes);
  assert.ok(first.plan.stops.length >= 2);
  assert.equal(first.plan.stops.some((stop) => stop.id === "zangfo-valley"), false);
  assert.equal(first.plan.stops.every((stop) => stop.verification === "候选点位"), true);
  assert.equal(first.plan.stops.every((stop) => stop.reason.includes("不是现场适游或安全结论")), true);
  assert.match(first.plan.boundaryNotes.join(" "), /未经管理方与现场核验/);
  assert.match(first.plan.boundaryNotes.join(" "), /候选行程升级为正式导航/);
  assert.equal(
    first.plan.legacyGuideHref,
    `/guide?demo=1&stops=${encodeURIComponent(first.plan.stops.map((stop) => stop.id).join(","))}`,
  );
});

test("time, pace, companion and interest choices produce meaningfully different routes", () => {
  const culture = buildPersonalRoute(customInput);
  const slow = buildPersonalRoute({
    duration: "半天",
    pace: "轻松",
    companion: "长辈同行",
    interests: ["休闲放松"],
  });
  const family = buildPersonalRoute({
    duration: "3小时",
    pace: "均衡",
    companion: "亲子",
    interests: ["互动体验"],
  });

  assert.equal(culture.ok && slow.ok && family.ok, true);
  if (!culture.ok || !slow.ok || !family.ok) return;

  const signatures = [culture, slow, family].map((result) => result.plan.stops.map((stop) => stop.id).join(","));
  assert.equal(new Set(signatures).size, signatures.length);
  assert.notEqual(culture.plan.totalDwellMinutes, slow.plan.totalDwellMinutes);
  assert.match(slow.plan.stops[0].reason, /休闲放松|少点慢游/);
  assert.match(family.plan.stops[0].reason, /互动体验|亲子/);
});

test("each recommendation opens its own generated content", () => {
  assert.equal(PERSONAL_ROUTE_RECOMMENDATIONS.length, 3);
  const results = PERSONAL_ROUTE_RECOMMENDATIONS.map((recommendation) => {
    const result = buildRecommendedPersonalRoute(recommendation.id);
    assert.equal(result.ok, true);
    if (!result.ok) return null;
    assert.equal(result.plan.title, recommendation.title);
    assert.equal(result.plan.stops.map((stop) => stop.name).join(" · "), recommendation.detail);
    assert.match(recommendation.meta, new RegExp(String(result.plan.totalDwellMinutes)));
    return result.plan.stops.map((stop) => stop.id).join(",");
  });

  assert.equal(new Set(results).size, results.length);
  assert.deepEqual(buildRecommendedPersonalRoute("unknown"), {
    ok: false,
    error: "未找到这条推荐路线，已停止生成。",
  });
});

test("invalid or empty preference inputs fail closed", () => {
  assert.equal(buildPersonalRoute({ ...customInput, interests: [] }).ok, false);
  assert.equal(buildPersonalRoute({ ...customInput, duration: "全天" }).ok, false);
  assert.equal(buildPersonalRoute({ ...customInput, interests: ["未知兴趣"] }).ok, false);
});

test("generated summaries explain inputs and every stop has a positive dwell", () => {
  const result = buildPersonalRoute({
    duration: "2小时",
    pace: "均衡",
    companion: "朋友同行",
    interests: ["休闲放松", "互动体验"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.match(result.plan.summary, /朋友同行/);
  assert.match(result.plan.summary, /休闲放松/);
  assert.equal(result.plan.stops.every((stop) => stop.dwellMinutes > 0 && stop.reason.length > 20), true);
});
