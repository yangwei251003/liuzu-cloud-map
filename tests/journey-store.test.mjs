import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyJourneyData,
  formatTravelogueText,
  journeyHasContent,
  parseJourneyData,
  reviseSavedRoute,
} from "../src/lib/journey-store.ts";

const route = {
  id: "route-test-1",
  title: "寻源半日线",
  plannedDate: "2026-08-16",
  duration: "3 小时",
  pace: "舒缓",
  note: "先确认现场开放与道路状态。",
  transport: "步行",
  sourceText: "想走一条以国恩寺为核心、节奏舒缓的路线。",
  status: "prototype",
  stops: [
    {
      id: "guoen-temple",
      name: "国恩寺",
      verification: "候选点位",
      dwellMinutes: 60,
      evidence: "LZ-003",
    },
  ],
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const draft = {
  id: "draft-test-1",
  title: "我的寻源之旅",
  body: "在有来源的讲解里慢慢了解六祖文化。",
  routeId: route.id,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const validData = {
  version: 1,
  routes: [route],
  stamps: [
    {
      id: "stamp-test-1",
      spotId: "guoen-temple",
      spotName: "国恩寺",
      note: "原型打卡",
      stampedAt: "2026-08-15T01:00:00.000Z",
    },
  ],
  drafts: [draft],
  updatedAt: "2026-08-15T01:00:00.000Z",
};

test("journey parser accepts the complete version 1 format without mutation", () => {
  const input = structuredClone(validData);
  assert.deepEqual(parseJourneyData(input), validData);
  assert.deepEqual(input, validData);
});

test("journey parser fails closed on unsupported or malformed data", () => {
  assert.equal(parseJourneyData(null), null);
  assert.equal(parseJourneyData({ ...validData, version: 2 }), null);
  assert.equal(parseJourneyData({ ...validData, routes: [{ ...route, id: "" }] }), null);
  assert.equal(parseJourneyData({ ...validData, drafts: [{ ...draft, routeId: 42 }] }), null);
  assert.equal(parseJourneyData({ ...validData, stamps: "not-an-array" }), null);
  assert.equal(parseJourneyData({ ...validData, unexpected: true }), null);
  assert.equal(parseJourneyData({ ...validData, routes: [{ ...route, transport: 42 }] }), null);
  assert.equal(parseJourneyData({ ...validData, routes: [{ ...route, revision: 1.5 }] }), null);
  assert.equal(parseJourneyData({ ...validData, routes: [{ ...route, stops: [{ ...route.stops[0], dwellMinutes: 9 }] }] }), null);
});

test("saved route revision increments only for a material edit and invalidates old execution binding", () => {
  const executableRoute = {
    ...route,
    transport: "步行优先（需核验）",
    planId: "plan-test-1",
    revision: 4,
    validationStatus: "BLOCKED",
    unresolvedCount: 0,
    status: "DEMO_ONLY",
    stops: [
      route.stops[0],
      {
        id: "huineng-residence",
        name: "六祖故居",
        verification: "候选点位",
        dwellMinutes: 30,
      },
    ],
  };
  const input = {
    title: "寻源慢游线",
    plannedDate: "2026-08-20",
    duration: "半天",
    pace: "深度",
    note: "和家人同行，预留休息时间。",
    transport: "公共交通",
    stops: [
      { ...executableRoute.stops[1], dwellMinutes: 45 },
      { ...executableRoute.stops[0], dwellMinutes: 60 },
    ],
  };
  const original = structuredClone(executableRoute);
  const result = reviseSavedRoute(executableRoute, input, "2026-08-15T02:00:00.000Z");

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(executableRoute, original);
  assert.equal(result.route.revision, 5);
  assert.equal(result.route.title, "寻源慢游线");
  assert.equal(result.route.transport, "公共交通");
  assert.deepEqual(result.route.stops.map((stop) => [stop.id, stop.dwellMinutes]), [
    ["huineng-residence", 45],
    ["guoen-temple", 60],
  ]);
  assert.equal(result.route.executionStatus, "NEEDS_REVALIDATION");
  assert.equal(result.route.status, "NEEDS_REVALIDATION");
  assert.equal(Object.hasOwn(result.route, "planId"), false);
  assert.equal(Object.hasOwn(result.route, "validationStatus"), false);
  assert.equal(Object.hasOwn(result.route, "unresolvedCount"), false);
  assert.equal(result.route.updatedAt, "2026-08-15T02:00:00.000Z");
  assert.deepEqual(
    parseJourneyData({ ...validData, routes: [result.route], updatedAt: result.route.updatedAt })?.routes[0],
    result.route,
  );
});

test("saved route no-op keeps the original revision and invalid edit fails closed", () => {
  const noOp = reviseSavedRoute(route, {
    title: ` ${route.title} `,
    plannedDate: route.plannedDate,
    duration: route.duration,
    pace: route.pace,
    note: route.note,
    transport: route.transport ?? "未指定",
    stops: route.stops.map((stop) => ({ ...stop, dwellMinutes: stop.dwellMinutes ?? null })),
  }, "2026-08-15T02:00:00.000Z");
  assert.deepEqual(noOp, { ok: true, changed: false, route });

  const invalid = reviseSavedRoute(route, {
    title: route.title,
    plannedDate: "2026-02-30",
    duration: route.duration,
    pace: route.pace,
    note: route.note,
    transport: "未指定",
    stops: [{ ...route.stops[0], dwellMinutes: 5 }],
  }, "2026-08-15T02:00:00.000Z");
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /计划日期格式无效/);
});

test("journey helpers detect content and format a self-contained travelogue", () => {
  assert.equal(journeyHasContent(createEmptyJourneyData()), false);
  assert.equal(journeyHasContent(validData), true);

  const text = formatTravelogueText(draft, route);
  assert.match(text, /^我的寻源之旅/);
  assert.match(text, /关联路线：寻源半日线/);
  assert.match(text, /计划日期：2026-08-16/);
  assert.match(text, /沿途节点：国恩寺/);
  assert.match(text, /在有来源的讲解里慢慢了解六祖文化。/);
  assert.match(text, /本地原型/);
});

test("empty travelogue body receives a readable fallback", () => {
  assert.match(formatTravelogueText({ ...draft, body: "   " }), /这篇游记还没有正文。/);
});
