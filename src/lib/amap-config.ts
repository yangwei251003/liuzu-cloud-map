export const AMAP_CONFIG_ENDPOINT = "/api/map-config";

export const AMAP_OFFICIAL_DOCS = {
  loader: "https://lbs.amap.com/api/javascript-api-v2/getting-started",
  security: "https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode",
  coordinateConversion: "https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom",
} as const;

export type DisabledAmapBrowserConfig = {
  provider: "amap-jsapi-v2";
  enabled: false;
  reason: "NOT_CONFIGURED" | "INVALID_CONFIGURATION";
};

export type EnabledAmapBrowserConfig = {
  provider: "amap-jsapi-v2";
  enabled: true;
  version: "2.0";
  coordinateSystem: "GCJ02";
  securityMode: "browser-preview";
  productionProxyRequired: true;
  key: string;
  securityJsCode: string;
};

export type AmapBrowserConfig = DisabledAmapBrowserConfig | EnabledAmapBrowserConfig;

type AmapEnvironment = Pick<NodeJS.ProcessEnv, "AMAP_JS_KEY" | "AMAP_SECURITY_JS_CODE">;

function boundedCredential(value: unknown, maximumLength: number) {
  if (typeof value !== "string" || value.length < 8 || value.length > maximumLength || value !== value.trim()) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

export function readAmapBrowserConfig(environment: AmapEnvironment): AmapBrowserConfig {
  const rawKey = environment.AMAP_JS_KEY;
  const rawSecurityCode = environment.AMAP_SECURITY_JS_CODE;
  if (!rawKey && !rawSecurityCode) {
    return { provider: "amap-jsapi-v2", enabled: false, reason: "NOT_CONFIGURED" };
  }

  const key = boundedCredential(rawKey, 128);
  const securityJsCode = boundedCredential(rawSecurityCode, 256);
  if (!key || !securityJsCode) {
    return { provider: "amap-jsapi-v2", enabled: false, reason: "INVALID_CONFIGURATION" };
  }

  return {
    provider: "amap-jsapi-v2",
    enabled: true,
    version: "2.0",
    coordinateSystem: "GCJ02",
    securityMode: "browser-preview",
    productionProxyRequired: true,
    key,
    securityJsCode,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function parseAmapBrowserConfig(value: unknown): AmapBrowserConfig | null {
  if (!isRecord(value) || value.provider !== "amap-jsapi-v2" || typeof value.enabled !== "boolean") return null;
  if (!value.enabled) {
    if (!hasExactKeys(value, ["provider", "enabled", "reason"])) return null;
    if (value.reason !== "NOT_CONFIGURED" && value.reason !== "INVALID_CONFIGURATION") return null;
    return { provider: "amap-jsapi-v2", enabled: false, reason: value.reason };
  }

  const key = boundedCredential(value.key, 128);
  const securityJsCode = boundedCredential(value.securityJsCode, 256);
  if (
    !hasExactKeys(value, ["provider", "enabled", "version", "coordinateSystem", "securityMode", "productionProxyRequired", "key", "securityJsCode"])
    ||
    !key
    || !securityJsCode
    || value.version !== "2.0"
    || value.coordinateSystem !== "GCJ02"
    || value.securityMode !== "browser-preview"
    || value.productionProxyRequired !== true
  ) return null;

  return {
    provider: "amap-jsapi-v2",
    enabled: true,
    version: "2.0",
    coordinateSystem: "GCJ02",
    securityMode: "browser-preview",
    productionProxyRequired: true,
    key,
    securityJsCode,
  };
}
