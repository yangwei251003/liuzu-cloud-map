import type { GeoJSON, Feature, LineString, MultiLineString } from "geojson";
import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import {
  DEFAULT_VISIBLE_MAP_LAYERS,
  FACILITY_SUBTYPES,
  MAP_THEMES,
  type FacilitySubtype,
  type MapLayerId,
  type MapThemeId,
} from "./map-experience";
import { tileProvider } from "./map-providers";

export type LocalMapDataBundle = {
  buildings: GeoJSON;
  waterways: GeoJSON;
  roads: GeoJSON;
  pois: GeoJSON;
  prototypeRoutes: GeoJSON;
  formalNetwork: unknown;
};

const SOURCE_IDS = {
  buildings: "liuzu-buildings",
  waterways: "liuzu-waterways",
  roads: "liuzu-roads",
  pois: "liuzu-pois",
  routes: "liuzu-prototype-routes",
} as const;

export const MAP_RENDER_LAYER_IDS = {
  buildings: ["liuzu-buildings-fill"],
  water: ["liuzu-water-lines"],
  roads: ["liuzu-road-casing", "liuzu-road-major", "liuzu-road-minor", "liuzu-footways", "liuzu-road-labels"],
  places: ["liuzu-place-points", "liuzu-place-labels", "liuzu-attraction-points", "liuzu-poi-labels"],
  facilities: ["liuzu-facility-points", "liuzu-facility-labels"],
  routes: ["liuzu-route-overview", "liuzu-route-selected-casing", "liuzu-route-selected"],
} satisfies Record<MapLayerId, string[]>;

const majorRoadSubtypes = ["primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link"];
const footwaySubtypes = ["footway", "path", "pedestrian", "steps", "track", "cycleway"];
const majorRoadFilter: FilterSpecification = ["match", ["get", "subtype"], majorRoadSubtypes, true, false];
const footwayFilter: FilterSpecification = ["match", ["get", "subtype"], footwaySubtypes, true, false];
const minorRoadFilter: FilterSpecification = [
  "all",
  ["match", ["get", "subtype"], majorRoadSubtypes, false, true],
  ["match", ["get", "subtype"], footwaySubtypes, false, true],
];
const facilityFilter: FilterSpecification = ["match", ["get", "subtype"], [...FACILITY_SUBTYPES], true, false];
const facilityLabelFilter: FilterSpecification = [
  "all",
  ["match", ["get", "subtype"], [...FACILITY_SUBTYPES], true, false],
  ["has", "name"],
];

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`map_source_${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > 8_000_000) throw new Error("map_source_too_large");
  return response.json() as Promise<unknown>;
}

export async function loadLocalMapData(signal?: AbortSignal): Promise<LocalMapDataBundle> {
  const sourcePlan = tileProvider.plan(null);
  const byId = new Map(sourcePlan.sources.map((source) => [source.id, source.url]));
  const [buildings, waterways, roads, pois, prototypeRoutes, formalNetwork] = await Promise.all([
    fetchJson(byId.get("buildings")!, signal),
    fetchJson(byId.get("waterways")!, signal),
    fetchJson(byId.get("roads")!, signal),
    fetchJson(byId.get("pois")!, signal),
    fetchJson(byId.get("prototype-routes")!, signal),
    fetchJson("/data/gis/route-network-manifest.v1.json", signal),
  ]);
  return {
    buildings: buildings as GeoJSON,
    waterways: waterways as GeoJSON,
    roads: roads as GeoJSON,
    pois: pois as GeoJSON,
    prototypeRoutes: prototypeRoutes as GeoJSON,
    formalNetwork,
  };
}

function visibility(visible: boolean): "visible" | "none" {
  return visible ? "visible" : "none";
}

export function addLocalMapData(map: MapLibreMap, bundle: LocalMapDataBundle, themeId: MapThemeId = "standard") {
  const theme = MAP_THEMES[themeId];
  map.addSource(SOURCE_IDS.buildings, { type: "geojson", data: bundle.buildings });
  map.addSource(SOURCE_IDS.waterways, { type: "geojson", data: bundle.waterways });
  map.addSource(SOURCE_IDS.roads, { type: "geojson", data: bundle.roads });
  map.addSource(SOURCE_IDS.pois, { type: "geojson", data: bundle.pois });
  map.addSource(SOURCE_IDS.routes, { type: "geojson", data: bundle.prototypeRoutes });

  map.addLayer({
    id: "liuzu-buildings-fill",
    type: "fill",
    source: SOURCE_IDS.buildings,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.buildings) },
    paint: { "fill-color": theme.colors.building, "fill-opacity": 0.62, "fill-outline-color": theme.colors.buildingOutline },
  });
  map.addLayer({
    id: "liuzu-water-lines",
    type: "line",
    source: SOURCE_IDS.waterways,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.water) },
    paint: { "line-color": theme.colors.water, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 17, 4], "line-opacity": 0.86 },
  });
  map.addLayer({
    id: "liuzu-road-casing",
    type: "line",
    source: SOURCE_IDS.roads,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.roads), "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme.colors.roadCasing,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.4, 14, 3.2, 17, 10],
      "line-opacity": 0.92,
    },
  });
  map.addLayer({
    id: "liuzu-road-major",
    type: "line",
    source: SOURCE_IDS.roads,
    filter: majorRoadFilter,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.roads), "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme.colors.roadMajor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 14, 2.2, 17, 6.5],
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "liuzu-road-minor",
    type: "line",
    source: SOURCE_IDS.roads,
    filter: minorRoadFilter,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.roads), "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme.colors.roadMinor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 14, 1.1, 17, 3.2],
      "line-opacity": 0.78,
    },
  });
  map.addLayer({
    id: "liuzu-footways",
    type: "line",
    source: SOURCE_IDS.roads,
    filter: footwayFilter,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.roads), "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme.colors.footway,
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.55, 17, 2.7],
      "line-dasharray": [1.1, 1.1],
      "line-opacity": 0.82,
    },
  });
  map.addLayer({
    id: "liuzu-road-labels",
    type: "symbol",
    source: SOURCE_IDS.roads,
    minzoom: 14,
    filter: ["all", ["has", "name"], ["!=", ["get", "name"], ""]],
    layout: {
      visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.roads),
      "symbol-placement": "line",
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 17, 13],
      "text-letter-spacing": 0.04,
      "text-max-angle": 38,
    },
    paint: { "text-color": theme.colors.label, "text-halo-color": theme.colors.background, "text-halo-width": 1.4, "text-opacity": 0.82 },
  });

  map.addLayer({
    id: "liuzu-place-points",
    type: "circle",
    source: SOURCE_IDS.pois,
    minzoom: 11.5,
    filter: ["==", ["get", "category"], "place"],
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.places) },
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 16, 5], "circle-color": theme.colors.poi, "circle-stroke-color": theme.colors.roadCasing, "circle-stroke-width": 1.5 },
  });
  map.addLayer({
    id: "liuzu-place-labels",
    type: "symbol",
    source: SOURCE_IDS.pois,
    minzoom: 11.5,
    filter: ["all", ["==", ["get", "category"], "place"], ["has", "name"]],
    layout: {
      visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.places),
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 14],
      "text-offset": [0, 0.9],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: { "text-color": theme.colors.label, "text-halo-color": theme.colors.background, "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "liuzu-attraction-points",
    type: "circle",
    source: SOURCE_IDS.pois,
    minzoom: 12.5,
    filter: ["match", ["get", "category"], ["tourism", "historic", "natural", "leisure"], true, false],
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.places) },
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2.3, 17, 6], "circle-color": theme.colors.poi, "circle-opacity": 0.82, "circle-stroke-color": theme.colors.roadCasing, "circle-stroke-width": 1.5 },
  });
  map.addLayer({
    id: "liuzu-poi-labels",
    type: "symbol",
    source: SOURCE_IDS.pois,
    minzoom: 14,
    filter: ["all", ["match", ["get", "category"], ["tourism", "historic", "natural", "leisure"], true, false], ["has", "name"]],
    layout: {
      visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.places),
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 17, 12],
      "text-offset": [0, 0.9],
      "text-anchor": "top",
    },
    paint: { "text-color": theme.colors.label, "text-halo-color": theme.colors.background, "text-halo-width": 1.4, "text-opacity": 0.9 },
  });
  map.addLayer({
    id: "liuzu-facility-points",
    type: "circle",
    source: SOURCE_IDS.pois,
    minzoom: 13,
    filter: facilityFilter,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.facilities) },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 17, 7],
      "circle-color": ["match", ["get", "subtype"], "hospital", "#a84e49", "police", "#415f76", "parking", "#65798d", theme.colors.poi],
      "circle-stroke-color": theme.colors.roadCasing,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "liuzu-facility-labels",
    type: "symbol",
    source: SOURCE_IDS.pois,
    minzoom: 15,
    filter: facilityLabelFilter,
    layout: {
      visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.facilities),
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-offset": [0, 1],
      "text-anchor": "top",
    },
    paint: { "text-color": theme.colors.label, "text-halo-color": theme.colors.background, "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "liuzu-route-overview",
    type: "line",
    source: SOURCE_IDS.routes,
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.routes), "line-cap": "round", "line-join": "round" },
    paint: { "line-color": theme.colors.route, "line-width": 2, "line-opacity": 0.22, "line-dasharray": [1, 1.2] },
  });
  map.addLayer({
    id: "liuzu-route-selected-casing",
    type: "line",
    source: SOURCE_IDS.routes,
    filter: ["==", ["get", "id"], ""],
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.routes), "line-cap": "round", "line-join": "round" },
    paint: { "line-color": theme.colors.roadCasing, "line-width": 8, "line-opacity": 0.94 },
  });
  map.addLayer({
    id: "liuzu-route-selected",
    type: "line",
    source: SOURCE_IDS.routes,
    filter: ["==", ["get", "id"], ""],
    layout: { visibility: visibility(DEFAULT_VISIBLE_MAP_LAYERS.routes), "line-cap": "round", "line-join": "round" },
    paint: { "line-color": theme.colors.route, "line-width": 4, "line-opacity": 0.96, "line-dasharray": [1.2, 0.7] },
  });
}

export function applyMapTheme(map: MapLibreMap, themeId: MapThemeId) {
  const colors = MAP_THEMES[themeId].colors;
  if (map.getLayer("liuzu-paper")) map.setPaintProperty("liuzu-paper", "background-color", colors.background);
  if (map.getLayer("liuzu-buildings-fill")) {
    map.setPaintProperty("liuzu-buildings-fill", "fill-color", colors.building);
    map.setPaintProperty("liuzu-buildings-fill", "fill-outline-color", colors.buildingOutline);
  }
  if (map.getLayer("liuzu-water-lines")) map.setPaintProperty("liuzu-water-lines", "line-color", colors.water);
  if (map.getLayer("liuzu-road-casing")) map.setPaintProperty("liuzu-road-casing", "line-color", colors.roadCasing);
  if (map.getLayer("liuzu-road-major")) map.setPaintProperty("liuzu-road-major", "line-color", colors.roadMajor);
  if (map.getLayer("liuzu-road-minor")) map.setPaintProperty("liuzu-road-minor", "line-color", colors.roadMinor);
  if (map.getLayer("liuzu-footways")) map.setPaintProperty("liuzu-footways", "line-color", colors.footway);
  for (const layer of ["liuzu-road-labels", "liuzu-place-labels", "liuzu-poi-labels", "liuzu-facility-labels"]) {
    if (map.getLayer(layer)) {
      map.setPaintProperty(layer, "text-color", colors.label);
      map.setPaintProperty(layer, "text-halo-color", colors.background);
    }
  }
  for (const layer of ["liuzu-place-points", "liuzu-attraction-points"]) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, "circle-color", colors.poi);
  }
  if (map.getLayer("liuzu-route-overview")) map.setPaintProperty("liuzu-route-overview", "line-color", colors.route);
  if (map.getLayer("liuzu-route-selected-casing")) map.setPaintProperty("liuzu-route-selected-casing", "line-color", colors.roadCasing);
  if (map.getLayer("liuzu-route-selected")) map.setPaintProperty("liuzu-route-selected", "line-color", colors.route);
}

export function applyMapLayerVisibility(map: MapLibreMap, layerId: MapLayerId, visible: boolean) {
  for (const renderLayerId of MAP_RENDER_LAYER_IDS[layerId]) {
    if (map.getLayer(renderLayerId)) map.setLayoutProperty(renderLayerId, "visibility", visibility(visible));
  }
}

export function applyFacilitySubtypeFilter(map: MapLibreMap, enabled: FacilitySubtype[]) {
  const filter: FilterSpecification = enabled.length
    ? ["match", ["get", "subtype"], enabled, true, false]
    : ["==", ["get", "subtype"], ""];
  const labelFilter: FilterSpecification = enabled.length
    ? ["all", ["match", ["get", "subtype"], enabled, true, false], ["has", "name"]]
    : ["==", ["get", "subtype"], ""];
  if (map.getLayer("liuzu-facility-points")) map.setFilter("liuzu-facility-points", filter);
  if (map.getLayer("liuzu-facility-labels")) map.setFilter("liuzu-facility-labels", labelFilter);
}

export function applySelectedPrototypeRoute(map: MapLibreMap, routeId: string | null) {
  const filter: FilterSpecification = ["==", ["get", "id"], routeId ?? ""];
  if (map.getLayer("liuzu-route-selected-casing")) map.setFilter("liuzu-route-selected-casing", filter);
  if (map.getLayer("liuzu-route-selected")) map.setFilter("liuzu-route-selected", filter);
}

function routeFeature(bundle: LocalMapDataBundle, routeId: string): Feature<LineString | MultiLineString> | null {
  if (bundle.prototypeRoutes.type !== "FeatureCollection") return null;
  const feature = bundle.prototypeRoutes.features.find((candidate) => {
    if (!candidate || candidate.type !== "Feature" || !candidate.properties || candidate.properties.id !== routeId) return false;
    return candidate.geometry?.type === "LineString" || candidate.geometry?.type === "MultiLineString";
  });
  return feature as Feature<LineString | MultiLineString> | null;
}

export function fitMapToPrototypeRoute(
  map: MapLibreMap,
  bundle: LocalMapDataBundle,
  routeId: string,
  context: "default" | "workspace" = "default",
) {
  const feature = routeFeature(bundle, routeId);
  if (!feature) return false;
  const coordinates = feature.geometry.type === "LineString" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
  if (!coordinates.length) return false;
  let west = coordinates[0][0];
  let east = west;
  let south = coordinates[0][1];
  let north = south;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  const wideWorkspace = context === "workspace" && map.getContainer().clientWidth >= 900;
  map.fitBounds([[west, south], [east, north]], {
    padding: wideWorkspace
      ? { top: 100, right: 170, bottom: 220, left: 390 }
      : { top: 92, right: 54, bottom: context === "workspace" ? 180 : 150, left: 54 },
    maxZoom: 16,
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
  });
  return true;
}
