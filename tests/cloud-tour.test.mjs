import assert from "node:assert/strict";
import test from "node:test";
import { AI_GUIDE_FACT_TYPE_LABELS } from "../src/lib/ai-guide/types.ts";
import {
  CLOUD_TOUR_BOUNDARY_NOTICE,
  cloudTourRoutes,
  cloudTourStations,
  getCloudTourStation,
  isCloudTourQuizChoiceCorrect,
  resolveCloudTourSelection,
} from "../src/lib/cloud-tour.ts";
import {
  CLOUD_TOUR_STORAGE_KEY,
  clearCloudTourProgress,
  completeCloudTourProgress,
  createCloudTourProgress,
  moveCloudTourProgress,
  parseCloudTourProgress,
  readCloudTourProgress,
  stampCloudTourProgress,
  writeCloudTourProgress,
} from "../src/lib/cloud-tour-store.ts";
import { scenicSpots } from "../src/lib/scenic-data.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test("cloud tour exposes only locally registered stations, stories and evidence-aligned quizzes", () => {
  assert.equal(cloudTourStations.length, scenicSpots.length);
  assert.match(CLOUD_TOUR_BOUNDARY_NOTICE, /线上内容体验/);
  assert.match(CLOUD_TOUR_BOUNDARY_NOTICE, /不提供.*导航结论/);

  for (const station of cloudTourStations) {
    assert.equal(station.id, station.spot.id);
    assert.equal(station.spot.verification, "候选点位");
    assert.ok(station.story.body.length > 20);
    assert.ok(station.story.factTypes.length > 0);
    assert.ok(station.story.sources.length > 0);
    assert.ok(station.story.sources.every((source) => source.checkedAt === "2026-08-14" || source.checkedAt === "2026-08-15"));
    assert.ok(station.story.factTypes.every((factType) => AI_GUIDE_FACT_TYPE_LABELS[factType]));
    assert.ok(station.story.sources.some((source) => source.id === station.quiz.sourceId));
    assert.equal(station.quiz.factType, station.story.factTypes[0]);
    assert.equal(station.quiz.options.filter((option) => isCloudTourQuizChoiceCorrect(station.id, option.id)).length, 1);
  }

  const zangfo = getCloudTourStation("zangfo-valley");
  assert.ok(zangfo);
  assert.match(zangfo.story.body, /待现场消歧/);
  assert.equal(zangfo.quiz.options.find((option) => option.id === zangfo.quiz.correctOptionId)?.label, "作为需要进一步核对的地点线索");
});

test("cloud tour routes are editorial chapter orders and never include the unresolved valley candidate", () => {
  assert.equal(cloudTourRoutes.length, 3);
  for (const route of cloudTourRoutes) {
    assert.ok(route.stopIds.length > 0);
    assert.equal(new Set(route.stopIds).size, route.stopIds.length);
    assert.ok(route.stopIds.every((stopId) => getCloudTourStation(stopId)));
    assert.ok(!route.stopIds.includes("zangfo-valley"));
    assert.match(route.contentOrderNotice, /不代表.*现场游览路线/);
    assert.deepEqual(resolveCloudTourSelection("route", route.id)?.stopIds, route.stopIds);
  }
  assert.deepEqual(resolveCloudTourSelection("station", "zangfo-valley")?.stopIds, ["zangfo-valley"]);
  assert.equal(resolveCloudTourSelection("station", "unknown"), null);
});

test("progress moves sequentially, records content stamps and completes only after every chapter is viewed", () => {
  const start = new Date("2026-08-15T03:00:00.000Z");
  let progress = createCloudTourProgress("route", "zen-origin", start);
  assert.deepEqual(progress.stopIds, ["guoen-temple", "huineng-residence", "longshan-spring"]);
  assert.deepEqual(progress.visitedStopIds, ["guoen-temple"]);
  assert.equal(progress.status, "IN_PROGRESS");
  assert.throws(() => moveCloudTourProgress(progress, 2), /cannot_skip_cloud_tour_chapter/);
  assert.throws(() => completeCloudTourProgress(progress), /not_ready/);

  progress = stampCloudTourProgress(progress, "guoen-temple", new Date("2026-08-15T03:01:00.000Z"));
  assert.deepEqual(progress.stampedStopIds, ["guoen-temple"]);
  assert.throws(() => stampCloudTourProgress(progress, "longshan-spring"), /invalid_cloud_tour_stamp/);

  progress = moveCloudTourProgress(progress, 1, new Date("2026-08-15T03:02:00.000Z"));
  progress = moveCloudTourProgress(progress, 0, new Date("2026-08-15T03:03:00.000Z"));
  assert.deepEqual(progress.visitedStopIds, ["guoen-temple", "huineng-residence"]);
  progress = moveCloudTourProgress(progress, 1, new Date("2026-08-15T03:04:00.000Z"));
  progress = moveCloudTourProgress(progress, 2, new Date("2026-08-15T03:05:00.000Z"));
  progress = completeCloudTourProgress(progress, new Date("2026-08-15T03:06:00.000Z"));
  assert.equal(progress.status, "COMPLETED");
  assert.deepEqual(parseCloudTourProgress(structuredClone(progress)), progress);
  assert.throws(() => moveCloudTourProgress(progress, 1), /invalid_cloud_tour_transition/);
});

test("progress parser fails closed when shape, route definition or lifecycle is inconsistent", () => {
  const progress = createCloudTourProgress("route", "zen-origin", new Date("2026-08-15T03:00:00.000Z"));
  assert.equal(parseCloudTourProgress({ ...progress, extra: true }), null);
  assert.equal(parseCloudTourProgress({ ...progress, stopIds: [...progress.stopIds].reverse() }), null);
  assert.equal(parseCloudTourProgress({ ...progress, currentIndex: 2 }), null);
  assert.equal(parseCloudTourProgress({ ...progress, visitedStopIds: [progress.stopIds[1]] }), null);
  assert.equal(parseCloudTourProgress({ ...progress, stampedStopIds: [progress.stopIds[1]] }), null);
  assert.equal(parseCloudTourProgress({ ...progress, status: "COMPLETED" }), null);
  assert.equal(parseCloudTourProgress({ ...progress, updatedAt: "not-a-date" }), null);
});

test("local progress storage round-trips, clears and reports failures honestly", () => {
  const storage = memoryStorage();
  const progress = createCloudTourProgress("station", "guoen-temple", new Date("2026-08-15T03:00:00.000Z"));
  assert.deepEqual(writeCloudTourProgress(progress, storage), { ok: true });
  assert.deepEqual(readCloudTourProgress(storage), { progress, error: null });
  assert.equal(storage.values.has(CLOUD_TOUR_STORAGE_KEY), true);
  assert.deepEqual(clearCloudTourProgress(storage), { ok: true });
  assert.deepEqual(readCloudTourProgress(storage), { progress: null, error: null });

  storage.values.set(CLOUD_TOUR_STORAGE_KEY, "{broken");
  assert.match(readCloudTourProgress(storage).error, /未能读取/);

  const throwingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.match(readCloudTourProgress(throwingStorage).error, /未能读取/);
  assert.equal(writeCloudTourProgress(progress, throwingStorage).ok, false);
  assert.equal(clearCloudTourProgress(throwingStorage).ok, false);
});
