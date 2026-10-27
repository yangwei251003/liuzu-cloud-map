import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { routeIdeas, scenicSpots } from "../src/lib/scenic-data.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("scenic candidates have unique identities, bounded coordinates and explicit status", () => {
  assert.ok(scenicSpots.length > 0);
  assert.equal(new Set(scenicSpots.map(({ id }) => id)).size, scenicSpots.length);
  assert.equal(new Set(scenicSpots.map(({ name }) => name)).size, scenicSpots.length);

  for (const spot of scenicSpots) {
    assert.match(spot.id, /^[a-z0-9-]+$/);
    assert.ok(Number.isFinite(spot.longitude) && spot.longitude >= 111.5 && spot.longitude <= 113);
    assert.ok(Number.isFinite(spot.latitude) && spot.latitude >= 21.8 && spot.latitude <= 23.3);
    assert.equal(spot.originalGcj02.length, 2);
    assert.ok(spot.originalGcj02.every(Number.isFinite));
    assert.ok(Math.abs(spot.longitude - spot.originalGcj02[0]) < 0.02);
    assert.ok(Math.abs(spot.latitude - spot.originalGcj02[1]) < 0.02);
    assert.equal(spot.verification, "候选点位");
  }
});

test("Zangfo Valley is excluded from all automatic route data", async () => {
  const zangfo = scenicSpots.find(({ id }) => id === "zangfo-valley");
  assert.ok(zangfo, "the candidate must remain visible as research data");
  assert.equal(zangfo.duration, "暂不生成导航");

  for (const idea of routeIdeas) {
    assert.ok(!`${idea.title}${idea.detail}${idea.meta}`.includes("藏佛"));
  }

  const routePath = path.join(projectRoot, "public", "data", "gis", "prototype-routes.geojson");
  const routes = JSON.parse(await readFile(routePath, "utf8"));
  const endpoints = new Set();
  for (const feature of routes.features) {
    assert.notEqual(feature.properties.from, "zangfo-valley");
    assert.notEqual(feature.properties.to, "zangfo-valley");
    endpoints.add(feature.properties.from);
    endpoints.add(feature.properties.to);
  }

  const navigableSpotIds = scenicSpots
    .filter(({ id }) => id !== "zangfo-valley")
    .map(({ id }) => id)
    .sort();
  assert.deepEqual([...endpoints].sort(), navigableSpotIds);
});

test("route idea identifiers are unique", () => {
  assert.equal(new Set(routeIdeas.map(({ id }) => id)).size, routeIdeas.length);
});
