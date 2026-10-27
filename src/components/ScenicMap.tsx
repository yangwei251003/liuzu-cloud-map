"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GeoJSON } from "geojson";
import type { ScenicSpot } from "@/lib/scenic-data";
import { extractAccessibleFacilities, type AccessibleMapFacility } from "@/lib/map-accessibility";

type ScenicMapProps = {
  spots: ScenicSpot[];
  selectedId: string;
  onSelect: (id: string) => void;
  activeRoute?: [string, string] | null;
  skin?: "standard" | "theme";
};

export function ScenicMap({ spots, selectedId, onSelect, activeRoute = null, skin = "theme" }: ScenicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const initialConfigRef = useRef({ activeRoute, skin });
  const mapDescriptionId = useId();
  const [dataError, setDataError] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [facilities, setFacilities] = useState<AccessibleMapFacility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    const sourceDefinitions = [
      ["buildings", "/data/gis/buildings.geojson"],
      ["waterways", "/data/gis/waterways.geojson"],
      ["roads", "/data/gis/roads.geojson"],
      ["osm-pois", "/data/gis/pois.geojson"],
      ["prototype-routes", "/data/gis/prototype-routes.geojson"],
    ] as const;

    void (async () => {
      const [maplibregl, sourceData] = await Promise.all([
        import("maplibre-gl"),
        Promise.all(sourceDefinitions.map(async ([id, url]) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`gis_source_${id}_${response.status}`);
          return [id, await response.json() as GeoJSON] as const;
        })),
      ]);
      if (cancelled || !containerRef.current) return;
      const facilitySource = sourceData.find(([id]) => id === "osm-pois")?.[1];
      setFacilities(extractAccessibleFacilities(facilitySource));
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [112.2229, 22.5924],
        zoom: 13.1,
        minZoom: 11,
        maxZoom: 18,
        attributionControl: false,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "paper", type: "background", paint: { "background-color": "#e9eee5" } }],
        },
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
      }));
      map.on("error", () => {
        if (!cancelled) {
          setDataError(true);
          setDataReady(false);
        }
      });

      map.on("load", () => {
        const initialRoute = initialConfigRef.current.activeRoute;
        const initialSkin = initialConfigRef.current.skin;
        const initialRouteFilter: import("maplibre-gl").FilterSpecification = initialRoute
          ? ["any",
              ["all", ["==", ["get", "from"], initialRoute[0]], ["==", ["get", "to"], initialRoute[1]]],
              ["all", ["==", ["get", "from"], initialRoute[1]], ["==", ["get", "to"], initialRoute[0]]],
            ]
          : ["==", ["get", "id"], ""];
        sourceData.forEach(([id, data]) => map.addSource(id, { type: "geojson", data }));
        map.addLayer({ id: "buildings-fill", type: "fill", source: "buildings", paint: { "fill-color": initialSkin === "theme" ? "#d4d8ca" : "#d9dde1", "fill-opacity": 0.62, "fill-outline-color": "#c1c9bb" } });
        map.addLayer({ id: "water-lines", type: "line", source: "waterways", paint: { "line-color": "#8daeb2", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 16, 3] } });
        map.addLayer({ id: "road-casing", type: "line", source: "roads", paint: { "line-color": "#fffaf0", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 16, 8] } });
        map.addLayer({ id: "road-lines", type: "line", source: "roads", paint: { "line-color": initialSkin === "theme" ? "#c1a46d" : "#7b8790", "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 2] } });
        map.addLayer({
          id: "facility-points",
          type: "circle",
          source: "osm-pois",
          minzoom: 13,
          filter: ["match", ["get", "subtype"], ["toilets", "parking", "hospital", "police", "information", "shelter"], true, false],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 7],
            "circle-color": ["match", ["get", "subtype"], "toilets", "#4f7a73", "parking", "#65798d", "hospital", "#b5504b", "police", "#425e76", "#8b7652"],
            "circle-stroke-color": "#fffaf0",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({ id: "active-route-casing", type: "line", source: "prototype-routes", filter: initialRouteFilter, paint: { "line-color": "#fffaf0", "line-width": 8, "line-opacity": 0.92 } });
        map.addLayer({ id: "active-route", type: "line", source: "prototype-routes", filter: initialRouteFilter, paint: { "line-color": "#d95a4a", "line-width": 4, "line-opacity": 0.95, "line-dasharray": [1.2, 0.7] } });

        spots.forEach((spot) => {
          const marker = document.createElement("button");
          marker.type = "button";
          marker.className = "scenic-marker";
          marker.setAttribute("aria-label", `查看候选景点${spot.name}，状态：${spot.verification}，未经现场核验`);
          marker.setAttribute("aria-pressed", String(spot.id === selectedIdRef.current));
          marker.setAttribute("aria-describedby", mapDescriptionId);
          marker.dataset.spotId = spot.id;
          marker.title = `${spot.name} · ${spot.verification} · 未经现场核验`;
          marker.appendChild(document.createElement("span"));
          marker.addEventListener("click", () => {
            setSelectedFacilityId(null);
            map.easeTo({
              center: [spot.longitude, spot.latitude],
              zoom: Math.max(map.getZoom(), 14.2),
              duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
            });
            onSelectRef.current(spot.id);
          });
          new maplibregl.Marker({ element: marker, anchor: "bottom" })
            .setLngLat([spot.longitude, spot.latitude])
            .addTo(map);
        });
        map.once("idle", () => {
          if (!cancelled) {
            setDataError(false);
            setDataReady(true);
          }
        });
      });
      mapRef.current = map;
      setDataError(false);
    })().catch(() => {
      if (!cancelled) {
        setDataError(true);
        setDataReady(false);
      }
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapDescriptionId, spots]);

  useEffect(() => {
    const selected = spots.find((spot) => spot.id === selectedId);
    if (!selected || !mapRef.current) return;
    containerRef.current?.querySelectorAll<HTMLButtonElement>(".scenic-marker").forEach((element) => {
      const active = element.dataset.spotId === selectedId;
      element.dataset.active = String(active);
      element.setAttribute("aria-pressed", String(active));
    });
    mapRef.current.easeTo({
      center: [selected.longitude, selected.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 14.2),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 750,
    });
  }, [selectedId, spots]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("active-route")) return;
    const filter: import("maplibre-gl").FilterSpecification = activeRoute
      ? ["any",
          ["all", ["==", ["get", "from"], activeRoute[0]], ["==", ["get", "to"], activeRoute[1]]],
          ["all", ["==", ["get", "from"], activeRoute[1]], ["==", ["get", "to"], activeRoute[0]]],
        ]
      : ["==", ["get", "id"], ""];
    map.setFilter("active-route-casing", filter);
    map.setFilter("active-route", filter);
  }, [activeRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const themed = skin === "theme";
    map.setPaintProperty("paper", "background-color", themed ? "#e9eee5" : "#eef1f3");
    if (map.getLayer("buildings-fill")) map.setPaintProperty("buildings-fill", "fill-color", themed ? "#d4d8ca" : "#d9dde1");
    if (map.getLayer("road-lines")) map.setPaintProperty("road-lines", "line-color", themed ? "#c1a46d" : "#7b8790");
  }, [skin]);

  function selectSpotFromList(spot: ScenicSpot) {
    setSelectedFacilityId(null);
    containerRef.current?.querySelectorAll<HTMLButtonElement>(".scenic-marker").forEach((element) => {
      const active = element.dataset.spotId === spot.id;
      element.dataset.active = String(active);
      element.setAttribute("aria-pressed", String(active));
    });
    mapRef.current?.easeTo({
      center: [spot.longitude, spot.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 14.2),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
    });
    onSelectRef.current(spot.id);
  }

  function selectFacility(facility: AccessibleMapFacility) {
    setSelectedFacilityId(facility.id);
    containerRef.current?.querySelectorAll<HTMLButtonElement>(".scenic-marker").forEach((element) => {
      element.dataset.active = "false";
      element.setAttribute("aria-pressed", "false");
    });
    mapRef.current?.easeTo({
      center: facility.coordinates,
      zoom: Math.max(mapRef.current.getZoom(), 15.2),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
    });
  }

  const selectedFacility = facilities.find((facility) => facility.id === selectedFacilityId) ?? null;

  return (
    <div className="relative h-full min-h-[420px] w-full" data-map-status={dataError ? "error" : dataReady ? "ready" : "loading"}>
      <p id={mapDescriptionId} className="sr-only">地图画布中的候选景点和设施均可从“地图点位与设施列表”使用键盘访问。所有点位仍需现场核验。</p>
      <div ref={containerRef} role="region" aria-label="六祖镇候选景点与设施地图" aria-describedby={mapDescriptionId} className="h-full min-h-[420px] w-full" />
      <details className="absolute right-3 top-20 z-20 w-[min(20rem,calc(100%-1.5rem))] rounded-2xl border border-white/75 bg-[#fffaf0]/96 text-[#173f35] shadow-[0_16px_45px_rgba(23,63,53,.2)] backdrop-blur-xl" data-map-access-list>
        <summary className="cursor-pointer list-none rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]">地图点位与设施列表</summary>
        <div className="max-h-[min(58dvh,430px)] overflow-y-auto border-t border-[#173f35]/10 px-3 pb-4">
          <section aria-labelledby={`${mapDescriptionId}-spots`}>
            <h2 id={`${mapDescriptionId}-spots`} className="sticky top-0 z-10 bg-[#fffaf0] pb-2 pt-3 text-xs font-semibold uppercase tracking-[.16em] text-[#8f713e]">候选景点 · {spots.length}</h2>
            <ul className="space-y-1">
              {spots.map((spot) => (
                <li key={spot.id}>
                  <button type="button" onClick={() => selectSpotFromList(spot)} aria-pressed={selectedId === spot.id && selectedFacilityId === null} className="w-full rounded-xl border border-transparent px-3 py-2.5 text-left outline-none hover:bg-[#eee7da] focus-visible:border-[#b88a43] focus-visible:bg-[#eee7da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b88a43] active:scale-[0.99]">
                    <strong className="block text-sm">{spot.name}</strong>
                    <span className="mt-1 block text-[11px] leading-5 text-[#6d7b74]">{spot.verification} · 未经现场核验</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby={`${mapDescriptionId}-facilities`} className="mt-3 border-t border-[#173f35]/10">
            <h2 id={`${mapDescriptionId}-facilities`} className="sticky top-0 z-10 bg-[#fffaf0] pb-2 pt-3 text-xs font-semibold uppercase tracking-[.16em] text-[#8f713e]">OSM 候选设施 · {facilities.length}</h2>
            {!dataReady && !dataError && <p className="px-3 py-3 text-xs text-[#6d7b74]" role="status">正在读取候选设施列表…</p>}
            {dataError && <p className="px-3 py-3 text-xs text-[#8b5146]">设施数据未载入，请稍后重试。</p>}
            {dataReady && facilities.length === 0 && <p className="px-3 py-3 text-xs text-[#6d7b74]">当前范围没有可列出的候选设施。</p>}
            <ul className="space-y-1">
              {facilities.map((facility) => (
                <li key={facility.id}>
                  <button type="button" onClick={() => selectFacility(facility)} aria-pressed={selectedFacilityId === facility.id} className="w-full rounded-xl border border-transparent px-3 py-2.5 text-left outline-none hover:bg-[#eee7da] focus-visible:border-[#b88a43] focus-visible:bg-[#eee7da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b88a43] active:scale-[0.99]">
                    <strong className="block text-sm">{facility.name}</strong>
                    <span className="mt-1 block text-[11px] leading-5 text-[#6d7b74]">{facility.typeLabel} · {facility.verification}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selectedFacility && (
            <section className="mt-4 rounded-xl border border-[#b88a43]/22 bg-[#f4eadb] p-3 text-xs leading-5" aria-live="polite">
              <strong className="block text-sm">{selectedFacility.name}</strong>
              <span className="mt-1 block text-[#65756e]">{selectedFacility.typeLabel} · {selectedFacility.verification}</span>
              <a href={selectedFacility.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-medium underline underline-offset-4">查看 OpenStreetMap 原始条目</a>
            </section>
          )}
        </div>
      </details>
      {dataError && <div role="alert" className="absolute inset-x-4 top-20 rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed]/95 p-4 text-sm leading-6 text-[#7d453d] shadow-lg">地图数据暂时无法载入。你仍可使用路线列表，并稍后重试。</div>}
    </div>
  );
}
