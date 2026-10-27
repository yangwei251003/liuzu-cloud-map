"use client";

import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { MapEditorDraftCollection } from "@/lib/map-editor-draft";
import { addLocalMapData, loadLocalMapData } from "@/lib/map-rendering.client";
import { acquirePmtilesProtocol } from "@/lib/pmtiles-protocol.client";

const SOURCE_ID = "gis-review-candidates";

function toFeatureCollection(collection: MapEditorDraftCollection): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: collection.drafts.map((draft) => ({
      type: "Feature",
      id: draft.id,
      geometry: structuredClone(draft.geometry),
      properties: { title: draft.title, objectType: draft.objectType },
    })),
  };
}

function positions(geometry: Geometry): [number, number][] {
  if (geometry.type === "Point") return [[geometry.coordinates[0], geometry.coordinates[1]]];
  if (geometry.type === "LineString") return geometry.coordinates.map((position): [number, number] => [position[0], position[1]]);
  if (geometry.type === "Polygon") return geometry.coordinates.flatMap((ring) => ring.map((position): [number, number] => [position[0], position[1]]));
  return [];
}

function renderCollection(map: MapLibreMap, collection: MapEditorDraftCollection) {
  const source = map.getSource<GeoJSONSource>(SOURCE_ID);
  if (!source) return;
  source.setData(toFeatureCollection(collection));
  const allPositions = collection.drafts.flatMap((draft) => positions(draft.geometry));
  if (allPositions.length === 0) return;
  let minLng = allPositions[0][0];
  let maxLng = minLng;
  let minLat = allPositions[0][1];
  let maxLat = minLat;
  for (const [lng, lat] of allPositions.slice(1)) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (minLng === maxLng && minLat === maxLat) {
    map.easeTo({ center: [minLng, minLat], zoom: 17, duration: 0 });
  } else {
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 64, maxZoom: 17.5, duration: 0 });
  }
}

export function GisDraftReviewMap({ collection }: { collection: MapEditorDraftCollection }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const collectionRef = useRef(collection);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const abortController = new AbortController();
    let cancelled = false;
    let releasePmtiles: (() => void) | null = null;

    void (async () => {
      try {
        const [maplibregl, bundle] = await Promise.all([
          import("maplibre-gl"),
          loadLocalMapData(abortController.signal),
        ]);
        if (cancelled || !containerRef.current) return;
        releasePmtiles = acquirePmtilesProtocol(maplibregl);
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
        const map = new maplibregl.Map({
          container: containerRef.current,
          center: [112.2229, 22.5924],
          zoom: 14,
          minZoom: 10.8,
          maxZoom: 19,
          attributionControl: false,
          localIdeographFontFamily: "system-ui, sans-serif",
          style: {
            version: 8,
            sources: {},
            layers: [{ id: "gis-review-paper", type: "background", paint: { "background-color": "#edf0ed" } }],
          },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");
        map.addControl(new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a> · 候选底图',
        }));
        map.on("load", () => {
          if (cancelled) return;
          addLocalMapData(map, bundle, "standard");
          map.addSource(SOURCE_ID, { type: "geojson", data: toFeatureCollection(collectionRef.current) });
          map.addLayer({
            id: "gis-review-polygons",
            type: "fill",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": "#b88a43", "fill-opacity": 0.22, "fill-outline-color": "#76551f" },
          });
          map.addLayer({
            id: "gis-review-lines",
            type: "line",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "LineString"],
            paint: { "line-color": "#a85749", "line-width": 5, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "gis-review-points",
            type: "circle",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 8,
              "circle-color": ["match", ["get", "objectType"], "ENTRANCE", "#315c9a", "POI", "#a85749", "FACILITY", "#3e735f", "#b88a43"],
              "circle-stroke-color": "#fffdf8",
              "circle-stroke-width": 2.5,
            },
          });
          renderCollection(map, collectionRef.current);
          setStatus("ready");
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      mapRef.current?.remove();
      mapRef.current = null;
      releasePmtiles?.();
    };
  }, []);

  useEffect(() => {
    collectionRef.current = collection;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    renderCollection(map, collection);
  }, [collection]);

  return (
    <div className="relative h-[430px] overflow-hidden rounded-[1.6rem] border border-[#173f35]/12 bg-[#edf0ed]">
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="待审 GIS 候选几何预览" />
      <div className="pointer-events-none absolute left-3 top-3 max-w-[270px] rounded-xl border border-white/70 bg-[#fffdf8]/92 px-3 py-2 text-[11px] leading-5 text-[#52645c] shadow-md backdrop-blur">
        <strong className="block text-[#173f35]">空间比对预览</strong>
        本地候选底图与待审几何都不是正式发布事实，不能据此确认可走或开放。
      </div>
      {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-[#edf0ed]/88 text-sm font-semibold" role="status">正在载入候选空间预览…</div>}
      {status === "error" && <div className="absolute inset-3 grid place-items-center rounded-2xl border border-[#a85749]/20 bg-[#fff6ed]/96 p-6 text-center text-sm leading-6 text-[#7d453d]" role="alert">空间预览无法载入；审核操作保持关闭，请使用导出资料在专业 GIS 工具中核验。</div>}
    </div>
  );
}
