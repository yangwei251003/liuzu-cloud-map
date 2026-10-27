import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FACILITY_VERIFICATION,
  extractAccessibleFacilities,
} from "../src/lib/map-accessibility.ts";

const poisPath = new URL("../public/data/gis/pois.geojson", import.meta.url);

test("OSM facility circles have a deterministic accessible list representation", async () => {
  const geojson = JSON.parse(await readFile(poisPath, "utf8"));
  const facilities = extractAccessibleFacilities(geojson);
  assert.ok(facilities.length > 0);
  assert.equal(new Set(facilities.map((facility) => facility.id)).size, facilities.length);
  assert.ok(facilities.every((facility) => facility.name.length > 0));
  assert.ok(facilities.every((facility) => facility.verification === FACILITY_VERIFICATION));
  assert.ok(facilities.every((facility) => facility.sourceUrl.startsWith("https://www.openstreetmap.org/")));
  assert.ok(facilities.some((facility) => facility.name.startsWith("未命名卫生间")));
  assert.ok(facilities.some((facility) => facility.typeLabel === "医疗设施"));
});

test("facility extraction skips unsupported, malformed and untrusted entries", () => {
  const input = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { osm_type: "node", osm_id: 1, name: "候选点", subtype: "restaurant", source_url: "https://www.openstreetmap.org/node/1" }, geometry: { type: "Point", coordinates: [112, 22] } },
      { type: "Feature", properties: { osm_type: "node", osm_id: 2, name: "候选卫生间", subtype: "toilets", source_url: "https://evil.example/node/2" }, geometry: { type: "Point", coordinates: [112, 22] } },
      { type: "Feature", properties: { osm_type: "node", osm_id: 3, name: "越界点", subtype: "parking", source_url: "https://www.openstreetmap.org/node/3" }, geometry: { type: "Point", coordinates: [999, 22] } },
    ],
  };
  assert.deepEqual(extractAccessibleFacilities(input), []);
  assert.deepEqual(extractAccessibleFacilities(null), []);
});
