import assert from "node:assert/strict";
import test from "node:test";
import {
  GUIDE_ARRIVAL_TRANSACTION_KEY,
  commitGuideArrival,
  recoverGuideArrivalTransaction,
} from "../src/lib/guide-arrival-transaction.ts";
import {
  GUIDE_SESSION_STORAGE_KEY,
  createGuideSession,
  parseGuideSession,
  transitionGuideSession,
} from "../src/lib/guide-session-store.ts";
import {
  JOURNEY_STORAGE_KEY,
  createEmptyJourneyData,
  parseJourneyData,
} from "../src/lib/journey-store.ts";

function memoryStorage(failAtSet = Number.POSITIVE_INFINITY) {
  const values = new Map();
  let sets = 0;
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      sets += 1;
      if (sets === failAtSet) throw new Error("quota");
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
}

function seed(storage) {
  const beforeJourney = createEmptyJourneyData();
  const beforeSession = createGuideSession(["guoen-temple", "huineng-residence"], { now: new Date("2026-08-15T01:00:00.000Z") });
  storage.values.set(GUIDE_SESSION_STORAGE_KEY, JSON.stringify(beforeSession));
  const now = "2026-08-15T01:01:00.000Z";
  const afterJourney = {
    ...beforeJourney,
    stamps: [{ id: "stamp-1", spotId: "guoen-temple", spotName: "国恩寺", note: "手动确认", stampedAt: now }],
    updatedAt: now,
  };
  const afterSession = transitionGuideSession(beforeSession, { type: "ARRIVE" }, new Date(now));
  return { beforeJourney, afterJourney, beforeSession, afterSession, spotId: "guoen-temple", now: new Date(now) };
}

test("arrival commits stamp and session together and removes its journal", () => {
  const storage = memoryStorage();
  const input = seed(storage);
  assert.deepEqual(commitGuideArrival(input, storage), { ok: true });
  assert.ok(parseJourneyData(JSON.parse(storage.getItem(JOURNEY_STORAGE_KEY))).stamps.some((stamp) => stamp.spotId === input.spotId));
  assert.equal(parseGuideSession(JSON.parse(storage.getItem(GUIDE_SESSION_STORAGE_KEY))).currentIndex, 1);
  assert.equal(storage.getItem(GUIDE_ARRIVAL_TRANSACTION_KEY), null);
});

test("a second write failure rolls both records back", () => {
  const storage = memoryStorage(3);
  const input = seed(storage);
  const result = commitGuideArrival(input, storage);
  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.equal(storage.getItem(JOURNEY_STORAGE_KEY), null);
  assert.deepEqual(parseGuideSession(JSON.parse(storage.getItem(GUIDE_SESSION_STORAGE_KEY))), input.beforeSession);
  assert.equal(storage.getItem(GUIDE_ARRIVAL_TRANSACTION_KEY), null);
});

test("prepared crash journal restores both previous records on next load", () => {
  const storage = memoryStorage();
  const input = seed(storage);
  const beforeSessionRaw = storage.getItem(GUIDE_SESSION_STORAGE_KEY);
  storage.values.set(GUIDE_ARRIVAL_TRANSACTION_KEY, JSON.stringify({
    version: 1,
    phase: "PREPARED",
    beforeJourneyRaw: null,
    beforeSessionRaw,
    createdAt: input.now.toISOString(),
  }));
  storage.values.set(JOURNEY_STORAGE_KEY, JSON.stringify(input.afterJourney));
  storage.values.set(GUIDE_SESSION_STORAGE_KEY, JSON.stringify(input.afterSession));
  assert.deepEqual(recoverGuideArrivalTransaction(storage), { ok: true, recovered: true });
  assert.equal(storage.getItem(JOURNEY_STORAGE_KEY), null);
  assert.deepEqual(parseGuideSession(JSON.parse(storage.getItem(GUIDE_SESSION_STORAGE_KEY))), input.beforeSession);
});

test("committed crash journal keeps applied records and only clears the journal", () => {
  const storage = memoryStorage();
  const input = seed(storage);
  storage.values.set(JOURNEY_STORAGE_KEY, JSON.stringify(input.afterJourney));
  storage.values.set(GUIDE_SESSION_STORAGE_KEY, JSON.stringify(input.afterSession));
  storage.values.set(GUIDE_ARRIVAL_TRANSACTION_KEY, JSON.stringify({
    version: 1,
    phase: "COMMITTED",
    beforeJourneyRaw: null,
    beforeSessionRaw: JSON.stringify(input.beforeSession),
    createdAt: input.now.toISOString(),
  }));
  assert.deepEqual(recoverGuideArrivalTransaction(storage), { ok: true, recovered: false });
  assert.ok(parseJourneyData(JSON.parse(storage.getItem(JOURNEY_STORAGE_KEY))).stamps.length === 1);
  assert.equal(parseGuideSession(JSON.parse(storage.getItem(GUIDE_SESSION_STORAGE_KEY))).currentIndex, 1);
});

test("stale or malformed transaction input fails closed", () => {
  const storage = memoryStorage();
  const input = seed(storage);
  storage.values.set(JOURNEY_STORAGE_KEY, JSON.stringify({ ...input.beforeJourney, updatedAt: "2026-08-15T00:30:00.000Z" }));
  assert.equal(commitGuideArrival(input, storage).ok, false);
  storage.values.set(GUIDE_ARRIVAL_TRANSACTION_KEY, "{bad");
  const recovery = recoverGuideArrivalTransaction(storage);
  assert.equal(recovery.ok, false);
  assert.match(recovery.error, /格式异常/);
});
