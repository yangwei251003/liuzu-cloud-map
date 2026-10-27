/**
 * TypeScript Type Definitions for Leaflet
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export namespace L {
  export interface LatLng {
    lat: number;
    lng: number;
    distanceTo(other: LatLng | [number, number]): number;
    equals(other: LatLng, maxMargin?: number): boolean;
    toString(): string;
  }

  export function latLng(lat: number, lng: number): LatLng;
  export function latLng(coords: [number, number]): LatLng;

  export interface LatLngBounds {
    getNorth(): number;
    getSouth(): number;
    getEast(): number;
    getWest(): number;
    getCenter(): LatLng;
    contains(other: LatLng | LatLngBounds): boolean;
    extend(latLngOrBounds: LatLng | LatLngBounds | [number, number]): this;
    pad(bufferRatio: number): LatLngBounds;
    isValid(): boolean;
  }

  export function latLngBounds(southWest: LatLng | [number, number], northEast: LatLng | [number, number]): LatLngBounds;
  export function latLngBounds(latlngs: (LatLng | [number, number])[]): LatLngBounds;

  export type LatLngBoundsExpression = LatLngBounds | (LatLng | [number, number])[];

  export interface Point {
    x: number;
    y: number;
  }

  export function point(x: number, y: number): Point;

  export interface Layer {
    addTo(map: Map): this;
    remove(): this;
    removeFrom(map: Map): this;
  }

  export interface IconOptions {
    iconUrl?: string;
    iconRetinaUrl?: string;
    iconSize?: [number, number] | Point;
    iconAnchor?: [number, number] | Point;
    popupAnchor?: [number, number] | Point;
    className?: string;
  }

  export interface DivIconOptions extends IconOptions {
    html?: string | HTMLElement | false;
    bgPos?: [number, number] | Point;
  }

  export interface DivIcon {
    options: DivIconOptions;
  }

  export function divIcon(options?: DivIconOptions): DivIcon;

  export interface MarkerOptions {
    icon?: DivIcon | any;
    keyboard?: boolean;
    title?: string;
    alt?: string;
    zIndexOffset?: number;
    opacity?: number;
    riseOnHover?: boolean;
    riseOffset?: number;
  }

  export interface Marker extends Layer {
    getLatLng(): LatLng;
    setLatLng(latlng: LatLng | [number, number]): this;
    setIcon(icon: DivIcon | any): this;
    setOpacity(opacity: number): this;
    getElement(): HTMLElement | undefined;
    bindPopup(content: string | HTMLElement | ((layer: Layer) => string | HTMLElement)): this;
    openPopup(): this;
    closePopup(): this;
    on(type: string, fn: (e: any) => void): this;
    off(type: string, fn?: (e: any) => void): this;
  }

  export function marker(latlng: LatLng | [number, number], options?: MarkerOptions): Marker;

  export interface PolylineOptions {
    color?: string;
    weight?: number;
    opacity?: number;
    lineCap?: string;
    lineJoin?: string;
    dashArray?: string | number[];
    dashOffset?: string;
    smoothFactor?: number;
    className?: string;
  }

  export interface Polyline extends Layer {
    getLatLngs(): LatLng[] | LatLng[][];
    setLatLngs(latlngs: (LatLng | [number, number])[]): this;
    getBounds(): LatLngBounds;
    setStyle(style: PolylineOptions): this;
  }

  export function polyline(latlngs: (LatLng | [number, number])[], options?: PolylineOptions): Polyline;

  export interface CircleOptions extends PolylineOptions {
    radius?: number;
    fill?: boolean;
    fillColor?: string;
    fillOpacity?: number;
  }

  export interface Circle extends Layer {
    getLatLng(): LatLng;
    setLatLng(latlng: LatLng | [number, number]): this;
    getRadius(): number;
    setRadius(radius: number): this;
  }

  export function circle(latlng: LatLng | [number, number], options?: CircleOptions): Circle;

  export interface TileLayerOptions {
    minZoom?: number;
    maxZoom?: number;
    maxNativeZoom?: number;
    tileSize?: number;
    subdomains?: string | string[];
    errorTileUrl?: string;
    attribution?: string;
    opacity?: number;
    zIndex?: number;
  }

  export interface TileLayer extends Layer {
    setUrl(url: string, noRedraw?: boolean): this;
  }

  export function tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;

  export interface GeoJSONOptions {
    pointToLayer?: (feature: any, latlng: LatLng) => Layer;
    style?: (feature: any) => any;
    onEachFeature?: (feature: any, layer: Layer) => void;
    filter?: (feature: any) => boolean;
  }

  export interface GeoJSON extends Layer {
    addData(data: any): this;
    resetStyle(layer?: Layer): this;
    setStyle(style: any): this;
    clearLayers(): this;
  }

  export function geoJSON(geojson?: any, options?: GeoJSONOptions): GeoJSON;

  export interface MapOptions {
    preferCanvas?: boolean;
    attributionControl?: boolean;
    zoomControl?: boolean;
    closePopupOnClick?: boolean;
    zoomSnap?: number;
    zoomDelta?: number;
    trackResize?: boolean;
    boxZoom?: boolean;
    doubleClickZoom?: boolean;
    dragging?: boolean;
    center?: LatLng | [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    layers?: Layer[];
  }

  export interface ZoomPanOptions {
    animate?: boolean;
    duration?: number;
    easeLinearity?: number;
    noMoveStart?: boolean;
  }

  export interface FitBoundsOptions extends ZoomPanOptions {
    paddingTopLeft?: [number, number] | Point;
    paddingBottomRight?: [number, number] | Point;
    padding?: [number, number] | Point;
    maxZoom?: number;
  }

  export interface Map {
    setView(center: LatLng | [number, number], zoom?: number, options?: ZoomPanOptions): this;
    flyTo(center: LatLng | [number, number], zoom?: number, options?: ZoomPanOptions): this;
    setZoom(zoom: number, options?: ZoomPanOptions): this;
    zoomIn(delta?: number, options?: ZoomPanOptions): this;
    zoomOut(delta?: number, options?: ZoomPanOptions): this;
    panTo(latlng: LatLng | [number, number], options?: ZoomPanOptions): this;
    fitBounds(bounds: LatLngBoundsExpression, options?: FitBoundsOptions): this;
    getBounds(): LatLngBounds;
    getCenter(): LatLng;
    getZoom(): number;
    hasLayer(layer: Layer): boolean;
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
    remove(): this;
    invalidateSize(options?: boolean | ZoomPanOptions): this;
    on(type: string, fn: (e: any) => void): this;
    off(type: string, fn?: (e: any) => void): this;
  }

  export function map(element: string | HTMLElement, options?: MapOptions): Map;

  export namespace control {
    export interface Zoom {
      addTo(map: Map): this;
      remove(): this;
    }
    export function zoom(options?: { position?: string }): Zoom;
  }
}

export type LeafletType = typeof L;
