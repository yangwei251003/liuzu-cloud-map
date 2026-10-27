import { getSafePublishedNetwork } from "./route-network";

export type ProviderReadiness = "READY" | "PROTOTYPE_ONLY" | "UNAVAILABLE";

export type ProviderStatus = {
  readiness: ProviderReadiness;
  code: string;
  message: string;
};

export type RouteCoordinate = {
  longitude: number;
  latitude: number;
  coordinateSystem: "WGS84" | "GCJ02";
};

export type RouteProviderRequest = {
  scenicAreaId: string;
  from: RouteCoordinate;
  to: RouteCoordinate;
};

export type RouteProviderResult = {
  status: ProviderReadiness;
  providerId: string;
  route: null;
  message: string;
};

export interface PublicRouteProvider {
  readonly id: string;
  readiness(): ProviderStatus;
  route(request: RouteProviderRequest): Promise<RouteProviderResult>;
}

export interface InternalRouteProvider {
  readonly id: string;
  inspectManifest(value: unknown, now?: Date): ProviderStatus;
  route(request: RouteProviderRequest, manifest: unknown): Promise<RouteProviderResult>;
}

export type TileSourceDescriptor = {
  id: "buildings" | "waterways" | "roads" | "pois" | "prototype-routes";
  url: string;
  protocol: "geojson";
  verification: "OSM_PUBLIC_CANDIDATE" | "UNVERIFIED_OSM_PROTOTYPE";
};

export type TileProviderPlan = {
  providerId: string;
  readiness: "READY" | "FALLBACK_GEOJSON";
  pmtilesArchiveUrl: string | null;
  message: string;
  sources: TileSourceDescriptor[];
};

export interface TileProvider {
  readonly id: string;
  plan(pmtilesArchiveUrl?: string | null): TileProviderPlan;
}

const NO_PUBLIC_ROUTE_MESSAGE = "公共道路路线服务尚未配置；当前地图不会虚构路线或把 OSM 候选线冒充正式导航。";
const NO_INTERNAL_ROUTE_MESSAGE = "正式景区路网尚未通过来源、权利、入口、现场和管理方核验；内部导航保持关闭。";

export class FailClosedPublicRouteProvider implements PublicRouteProvider {
  readonly id = "public-route-unconfigured";

  readiness(): ProviderStatus {
    return { readiness: "UNAVAILABLE", code: "PUBLIC_ROUTE_NOT_CONFIGURED", message: NO_PUBLIC_ROUTE_MESSAGE };
  }

  async route(request: RouteProviderRequest): Promise<RouteProviderResult> {
    void request;
    return { status: "UNAVAILABLE", providerId: this.id, route: null, message: NO_PUBLIC_ROUTE_MESSAGE };
  }
}

export class ValidatedManifestInternalRouteProvider implements InternalRouteProvider {
  readonly id = "validated-internal-network";

  inspectManifest(value: unknown, now = new Date()): ProviderStatus {
    const network = getSafePublishedNetwork(value, now, "liuzu-town");
    if (!network) return { readiness: "UNAVAILABLE", code: "FORMAL_NETWORK_UNAVAILABLE", message: NO_INTERNAL_ROUTE_MESSAGE };
    return {
      readiness: "READY",
      code: "FORMAL_NETWORK_VALIDATED",
      message: `正式路网 ${network.revision} 已通过严格校验，可进入独立路由计算器。`,
    };
  }

  async route(request: RouteProviderRequest, manifest: unknown): Promise<RouteProviderResult> {
    const status = this.inspectManifest(manifest);
    if (status.readiness !== "READY") return { status: "UNAVAILABLE", providerId: this.id, route: null, message: status.message };
    if (request.from.coordinateSystem !== "WGS84" || request.to.coordinateSystem !== "WGS84") {
      return {
        status: "UNAVAILABLE",
        providerId: this.id,
        route: null,
        message: "内部正式路网使用 WGS84；未经显式转换和控制点验证的坐标请求已拒绝。",
      };
    }
    return {
      status: "UNAVAILABLE",
      providerId: this.id,
      route: null,
      message: "路网清单已就绪，但路径算法服务尚未接入；为避免生成未经校验的捷径，本次不返回路线。",
    };
  }
}

const localSources: TileSourceDescriptor[] = [
  { id: "buildings", url: "/data/gis/buildings.geojson", protocol: "geojson", verification: "OSM_PUBLIC_CANDIDATE" },
  { id: "waterways", url: "/data/gis/waterways.geojson", protocol: "geojson", verification: "OSM_PUBLIC_CANDIDATE" },
  { id: "roads", url: "/data/gis/roads.geojson", protocol: "geojson", verification: "OSM_PUBLIC_CANDIDATE" },
  { id: "pois", url: "/data/gis/pois.geojson", protocol: "geojson", verification: "OSM_PUBLIC_CANDIDATE" },
  { id: "prototype-routes", url: "/data/gis/prototype-routes.geojson", protocol: "geojson", verification: "UNVERIFIED_OSM_PROTOTYPE" },
];

export function normalizePmtilesArchiveUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 500) return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text, "https://local.invalid");
    if (!url.pathname.toLocaleLowerCase().endsWith(".pmtiles")) return null;
    if (url.origin === "https://local.invalid") return url.pathname.startsWith("/") ? `${url.pathname}${url.search}` : null;
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export class HybridLocalTileProvider implements TileProvider {
  readonly id = "local-map-data";

  plan(pmtilesArchiveUrl?: string | null): TileProviderPlan {
    const archive = normalizePmtilesArchiveUrl(pmtilesArchiveUrl);
    if (archive) {
      return {
        providerId: this.id,
        readiness: "READY",
        pmtilesArchiveUrl: archive,
        message: "PMTiles 协议与归档地址已配置；图层启用前仍须验证归档元数据、来源和许可。",
        sources: localSources.map((source) => ({ ...source })),
      };
    }
    return {
      providerId: this.id,
      readiness: "FALLBACK_GEOJSON",
      pmtilesArchiveUrl: null,
      message: "PMTiles 协议已预留，但当前没有已核验归档；地图继续使用本地 GeoJSON 候选数据。",
      sources: localSources.map((source) => ({ ...source })),
    };
  }
}

export const publicRouteProvider = new FailClosedPublicRouteProvider();
export const internalRouteProvider = new ValidatedManifestInternalRouteProvider();
export const tileProvider = new HybridLocalTileProvider();
