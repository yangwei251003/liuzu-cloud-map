/**
 * Leaflet 地图引擎 — 初始化与生命周期管理
 */

import type { L, LeafletType } from "@/types/leaflet";

export type TileLayerConfig = {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
};

export const TILE_LAYERS: Record<string, TileLayerConfig> = {
  osm: {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

export const LIUZU_CENTER: [number, number] = [22.596, 112.218];
export const LIUZU_DEFAULT_ZOOM = 14;

export type MapEngineOptions = {
  center?: [number, number];
  zoom?: number;
  tileLayer?: string;
  zoomControl?: boolean;
  attributionControl?: boolean;
  onViewportChange?: (bounds: { north: number; south: number; east: number; west: number }, zoom: number) => void;
};

export type MapEngineHandle = {
  map: L.Map;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  panTo: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (bounds: L.LatLngBoundsExpression, padding?: number) => void;
  getBounds: () => { north: number; south: number; east: number; west: number };
  destroy: () => void;
};

export function createMapEngine(
  container: HTMLElement,
  leaflet: LeafletType,
  options: MapEngineOptions = {},
): MapEngineHandle {
  const {
    center = LIUZU_CENTER,
    zoom = LIUZU_DEFAULT_ZOOM,
    tileLayer = "osm",
    zoomControl = false,
    attributionControl = true,
    onViewportChange,
  } = options;

  const map = leaflet.map(container, {
    zoomControl,
    attributionControl,
    center,
    zoom,
  });

  leaflet.control.zoom({ position: "bottomright" }).addTo(map);

  const tileConfig = TILE_LAYERS[tileLayer] || TILE_LAYERS.osm;
  leaflet.tileLayer(tileConfig.url, {
    maxZoom: tileConfig.maxZoom,
    attribution: tileConfig.attribution,
  }).addTo(map);

  function emitViewport() {
    if (!onViewportChange) return;
    const b = map.getBounds();
    onViewportChange(
      {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      },
      map.getZoom(),
    );
  }

  map.on("moveend", emitViewport);
  map.on("zoomend", emitViewport);

  const handle: MapEngineHandle = {
    map,
    resetView: () => map.setView(center, zoom, { animate: true }),
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    panTo: (lat, lng, z) => {
      if (z !== undefined) {
        map.setView([lat, lng], z, { animate: true });
      } else {
        map.panTo([lat, lng], { animate: true });
      }
    },
    fitBounds: (bounds, padding = 60) => map.fitBounds(bounds, { padding: [padding, padding] }),
    getBounds: () => {
      const b = map.getBounds();
      return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
    },
    destroy: () => {
      map.off("moveend", emitViewport);
      map.off("zoomend", emitViewport);
      map.remove();
    },
  };

  return handle;
}
