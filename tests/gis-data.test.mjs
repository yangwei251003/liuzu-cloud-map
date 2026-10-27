import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gisRoot = path.join(projectRoot, "public", "data", "gis");

async function readJson(name) {
  return JSON.parse(await readFile(path.join(gisRoot, name), "utf8"));
}

function assertCoordinateTree(value, fileName) {
  assert.ok(Array.isArray(value) && value.length > 0, `${fileName}: coordinates must be a non-empty array`);

  if (typeof value[0] === "number") {
    assert.ok(value.length >= 2, `${fileName}: a position needs longitude and latitude`);
    assert.ok(value.every(Number.isFinite), `${fileName}: positions may only contain finite numbers`);
    assert.ok(value[0] >= 111.5 && value[0] <= 113, `${fileName}: longitude is outside the project area`);
    assert.ok(value[1] >= 21.8 && value[1] <= 23.3, `${fileName}: latitude is outside the project area`);
    return;
  }

  for (const child of value) assertCoordinateTree(child, fileName);
}

const osmLayers = [
  ["buildings.geojson", 1],
  ["pois.geojson", 1],
  ["roads.geojson", 1],
  ["waterways.geojson", 1],
];

for (const [fileName, minimumFeatures] of osmLayers) {
  test(`${fileName} is sourced, WGS84 GeoJSON`, async () => {
    const collection = await readJson(fileName);
    assert.equal(collection.type, "FeatureCollection");
    assert.ok(Array.isArray(collection.features));
    assert.ok(collection.features.length >= minimumFeatures, `${fileName}: layer must not be empty`);

    const identities = new Set();
    for (const feature of collection.features) {
      assert.equal(feature.type, "Feature");
      assert.ok(feature.geometry && typeof feature.geometry.type === "string");
      assertCoordinateTree(feature.geometry.coordinates, fileName);

      const properties = feature.properties;
      assert.ok(properties && typeof properties === "object");
      assert.match(properties.osm_type, /^(node|way|relation)$/);
      assert.ok(Number.isSafeInteger(properties.osm_id));
      assert.equal(properties.source, "OpenStreetMap contributors");
      assert.equal(properties.source_crs, "EPSG:4326");
      assert.match(properties.source_url, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);

      const identity = `${properties.osm_type}/${properties.osm_id}`;
      assert.ok(!identities.has(identity), `${fileName}: duplicate OSM feature ${identity}`);
      identities.add(identity);
    }
  });
}

test("prototype routes remain explicitly unverified and attributable", async () => {
  const collection = await readJson("prototype-routes.geojson");
  assert.equal(collection.type, "FeatureCollection");
  assert.ok(Array.isArray(collection.features) && collection.features.length > 0);

  const routeIds = new Set();
  for (const feature of collection.features) {
    assert.equal(feature.type, "Feature");
    assert.equal(feature.geometry?.type, "LineString");
    assertCoordinateTree(feature.geometry.coordinates, "prototype-routes.geojson");

    const properties = feature.properties;
    assert.ok(properties && typeof properties === "object");
    assert.ok(typeof properties.id === "string" && properties.id.length > 0);
    assert.ok(!routeIds.has(properties.id), `duplicate route ${properties.id}`);
    routeIds.add(properties.id);
    assert.ok(typeof properties.from === "string" && properties.from.length > 0);
    assert.ok(typeof properties.to === "string" && properties.to.length > 0);
    assert.ok(Number.isFinite(properties.distance_m) && properties.distance_m > 0);
    assert.equal(properties.status, "UNVERIFIED_OSM_PROTOTYPE");
    assert.match(properties.warning, /未.*核验/);
    assert.equal(properties.source, "OpenStreetMap contributors");
  }
});
