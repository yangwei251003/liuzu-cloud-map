export type AmapCoordinate = [number, number];

export type AmapOverlay = object;

export type AmapLngLat = {
  getLng(): number;
  getLat(): number;
};

export type AmapRouteStep = {
  instruction?: string;
  road?: string;
  distance?: number;
  time?: number;
  path?: AmapLngLat[];
  action?: string;
  assistant_action?: string;
};

export type AmapRoutePath = {
  distance?: number;
  time?: number;
  steps?: AmapRouteStep[];
};

export type AmapRouteResult = {
  info?: string;
  routes?: AmapRoutePath[];
};

export type AmapGeolocationResult = {
  position?: AmapLngLat;
  accuracy?: number;
  location_type?: string;
  message?: string;
  formattedAddress?: string;
};

export type AmapMap = {
  on(event: "complete", handler: () => void): void;
  on(event: "error", handler: (event?: unknown) => void): void;
  on(event: string, handler: (event?: unknown) => void): void;
  off(event: "complete", handler: () => void): void;
  off(event: "error", handler: (event?: unknown) => void): void;
  off(event: string, handler: (event?: unknown) => void): void;
  add(overlays: AmapOverlay | AmapOverlay[]): void;
  remove(overlays: AmapOverlay | AmapOverlay[]): void;
  destroy(): void;
  resize(): void;
  getZoom(): number;
  setCenter(center: AmapCoordinate): void;
  setFeatures(features: Array<"bg" | "point" | "road" | "building">): void;
  setMapStyle(style: string): void;
  setPitch(pitch: number): void;
  setRotation(rotation: number): void;
  setZoom(zoom: number): void;
  setFitView(overlays?: AmapOverlay[], immediately?: boolean, avoid?: [number, number, number, number], maxZoom?: number): void;
  zoomIn(): void;
  zoomOut(): void;
  panBy(x: number, y: number): void;
};

export type AmapMarkerOverlay = AmapOverlay & {
  setPosition(position: AmapCoordinate): void;
  getPosition?(): AmapLngLat;
};

export type AmapCircleOverlay = AmapOverlay & {
  setCenter(center: AmapCoordinate): void;
  setRadius(radius: number): void;
};

export type AmapRoutePlanner = {
  search(
    origin: AmapCoordinate,
    destination: AmapCoordinate,
    callback: (status: string, result: AmapRouteResult | string) => void,
  ): void;
  clear(): void;
};

export type AmapGeolocation = {
  getCurrentPosition(callback: (status: string, result: AmapGeolocationResult | string) => void): void;
};

type AmapMapOptions = {
  center: AmapCoordinate;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  viewMode: "3D";
  pitch: number;
  rotation: number;
  mapStyle: string;
  features: Array<"bg" | "point" | "road" | "building">;
  keyboardEnable?: boolean;
  dragEnable?: boolean;
  zoomEnable?: boolean;
  doubleClickZoom?: boolean;
  touchZoom?: boolean;
  showLabel?: boolean;
  showBuildingBlock?: boolean;
};

type AmapMarkerOptions = {
  position: AmapCoordinate;
  content: HTMLElement;
  anchor?: "bottom-center" | "center";
  zIndex?: number;
};

type AmapRoutePlannerOptions = {
  map?: AmapMap;
  panel?: string;
  autoFitView?: boolean;
  hideMarkers?: boolean;
  isOutline?: boolean;
  outlineColor?: string;
  showTraffic?: boolean;
};

type AmapGeolocationOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  convert?: boolean;
  showButton?: boolean;
  showMarker?: boolean;
  showCircle?: boolean;
  panToLocation?: boolean;
  zoomToAccuracy?: boolean;
};

type AmapPolylineOptions = {
  path: AmapCoordinate[];
  strokeColor: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  strokeStyle?: "solid" | "dashed";
  lineJoin?: "round" | "miter" | "bevel";
  lineCap?: "round" | "butt" | "square";
  zIndex?: number;
};

type AmapCircleOptions = {
  center: AmapCoordinate;
  radius: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillColor?: string;
  fillOpacity?: number;
  zIndex?: number;
};

export type AmapNamespace = {
  Map: new (container: HTMLElement, options: AmapMapOptions) => AmapMap;
  Marker: new (options: AmapMarkerOptions) => AmapMarkerOverlay;
  Polyline: new (options: AmapPolylineOptions) => AmapOverlay;
  Circle: new (options: AmapCircleOptions) => AmapCircleOverlay;
  Walking?: new (options: AmapRoutePlannerOptions) => AmapRoutePlanner;
  Driving?: new (options: AmapRoutePlannerOptions) => AmapRoutePlanner;
  Geolocation?: new (options: AmapGeolocationOptions) => AmapGeolocation;
  plugin(plugins: string | string[], callback: () => void): void;
  convertFrom(
    coordinate: AmapCoordinate,
    source: "gps",
    callback: (status: "complete" | "error" | string, result: { locations?: AmapLngLat[] } | string) => void,
  ): void;
};

export type AmapLoaderGlobal = {
  load(options: { key: string; version: "2.0"; plugins?: string[] }): Promise<AmapNamespace>;
};

/**
 * Small, intentionally bounded Loca 2.0 surface used by the exhibition-only
 * overlays. Keeping this contract local means the public map and navigation
 * code do not depend on undocumented Loca internals.
 */
export type LocaLayer = {
  setSource(source: unknown): void;
  setStyle(style: Record<string, unknown>): void;
  addAnimate?(animation: Record<string, unknown>): void;
  show?(duration?: number): void;
  hide?(duration?: number): void;
  destroy?(): void;
};

export type LocaContainer = {
  add(layer: LocaLayer): void;
  remove?(layer: LocaLayer): void;
  clear?(): void;
  destroy?(): void;
  animate: {
    start(): void;
    stop?(): void;
    pause?(): void;
    clear?(): void;
  };
};

export type LocaGeoJsonSourceOptions = {
  data: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: Record<string, unknown>;
      geometry: {
        type: "Point" | "LineString" | "Polygon";
        coordinates: unknown;
      };
    }>;
  };
};

export type LocaNamespace = {
  Container: new (options: { map: AmapMap }) => LocaContainer;
  GeoJSONSource: new (options: LocaGeoJsonSourceOptions) => unknown;
  PointLayer: new (options: Record<string, unknown>) => LocaLayer;
  LinkLayer: new (options: Record<string, unknown>) => LocaLayer;
  PulseLineLayer: new (options: Record<string, unknown>) => LocaLayer;
  PolygonLayer: new (options: Record<string, unknown>) => LocaLayer;
  PrismLayer: new (options: Record<string, unknown>) => LocaLayer;
};

declare global {
  interface Window {
    AMapLoader?: AmapLoaderGlobal;
    Loca?: LocaNamespace;
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}
