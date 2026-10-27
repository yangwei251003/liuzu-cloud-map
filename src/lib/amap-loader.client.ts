import { AMAP_CONFIG_ENDPOINT, parseAmapBrowserConfig, type EnabledAmapBrowserConfig } from "@/lib/amap-config";
import type { AmapLoaderGlobal, AmapNamespace, LocaNamespace } from "@/lib/amap-types";

const LOADER_SCRIPT_ID = "liuzu-amap-official-loader";
const OFFICIAL_LOADER_URL = "https://webapi.amap.com/loader.js";
const LOCA_SCRIPT_ID = "liuzu-amap-loca-v2";
const OFFICIAL_LOCA_URL = "https://webapi.amap.com/loca";
const MAX_CONFIG_RESPONSE_BYTES = 4_096;
const LOAD_TIMEOUT_MS = 15_000;

export class AmapUnavailableError extends Error {
  constructor(public readonly code: "NOT_CONFIGURED" | "INVALID_CONFIGURATION" | "CONFIG_UNAVAILABLE" | "SDK_UNAVAILABLE") {
    super(code);
    this.name = "AmapUnavailableError";
  }
}

async function fetchBrowserConfig(): Promise<EnabledAmapBrowserConfig> {
  let response: Response;
  try {
    response = await fetch(AMAP_CONFIG_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new AmapUnavailableError("CONFIG_UNAVAILABLE");
  }
  if (!response.ok) throw new AmapUnavailableError("CONFIG_UNAVAILABLE");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONFIG_RESPONSE_BYTES) {
    throw new AmapUnavailableError("INVALID_CONFIGURATION");
  }
  const text = await response.text();
  if (text.length > MAX_CONFIG_RESPONSE_BYTES) throw new AmapUnavailableError("INVALID_CONFIGURATION");

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AmapUnavailableError("INVALID_CONFIGURATION");
  }
  const config = parseAmapBrowserConfig(payload);
  if (!config) throw new AmapUnavailableError("INVALID_CONFIGURATION");
  if (!config.enabled) throw new AmapUnavailableError(config.reason);
  return config;
}

function waitForOfficialLoader(): Promise<AmapLoaderGlobal> {
  if (window.AMapLoader) return Promise.resolve(window.AMapLoader);
  const existing = document.getElementById(LOADER_SCRIPT_ID) as HTMLScriptElement | null;

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new AmapUnavailableError("SDK_UNAVAILABLE"));
    }, LOAD_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (window.AMapLoader) resolve(window.AMapLoader);
      else reject(new AmapUnavailableError("SDK_UNAVAILABLE"));
    };
    const handleError = () => {
      cleanup();
      if (!existing) script.remove();
      reject(new AmapUnavailableError("SDK_UNAVAILABLE"));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    if (!existing) {
      script.id = LOADER_SCRIPT_ID;
      script.src = OFFICIAL_LOADER_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

let browserConfigPromise: Promise<EnabledAmapBrowserConfig> | null = null;
let namespacePromise: Promise<AmapNamespace> | null = null;
let locaPromise: Promise<LocaNamespace> | null = null;

function loadBrowserConfig() {
  if (browserConfigPromise) return browserConfigPromise;
  browserConfigPromise = fetchBrowserConfig().catch((error: unknown) => {
    browserConfigPromise = null;
    throw error;
  });
  return browserConfigPromise;
}

function waitForOfficialLoca(config: EnabledAmapBrowserConfig): Promise<LocaNamespace> {
  if (window.Loca) return Promise.resolve(window.Loca);
  const existing = document.getElementById(LOCA_SCRIPT_ID) as HTMLScriptElement | null;

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new AmapUnavailableError("SDK_UNAVAILABLE"));
    }, LOAD_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (window.Loca) resolve(window.Loca);
      else reject(new AmapUnavailableError("SDK_UNAVAILABLE"));
    };
    const handleError = () => {
      cleanup();
      if (!existing) script.remove();
      reject(new AmapUnavailableError("SDK_UNAVAILABLE"));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    if (!existing) {
      script.id = LOCA_SCRIPT_ID;
      script.async = true;
      script.src = `${OFFICIAL_LOCA_URL}?v=2.0.0&key=${encodeURIComponent(config.key)}`;
      document.head.appendChild(script);
    }
  });
}

export function loadOfficialAmap(): Promise<AmapNamespace> {
  if (namespacePromise) return namespacePromise;
  namespacePromise = (async () => {
    const config = await loadBrowserConfig();
    // 高德官方要求：securityJsCode 必须在 JS API 脚本装载前设置。
    // 此处是本地预览模式；生产环境应改用官方 serviceHost 代理方案。
    window._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
    const loader = await waitForOfficialLoader();
    return loader.load({
      key: config.key,
      version: config.version,
      plugins: ["AMap.Geolocation", "AMap.Walking", "AMap.Driving"],
    });
  })().catch((error: unknown) => {
    namespacePromise = null;
    if (error instanceof AmapUnavailableError) throw error;
    throw new AmapUnavailableError("SDK_UNAVAILABLE");
  });
  return namespacePromise;
}

/**
 * Loca is deliberately lazy: ordinary map and navigation routes only load the
 * JS API. The exhibition renderer requests this after the factual map is
 * ready, and gracefully keeps the map usable if Loca is unavailable.
 */
export function loadOfficialLoca(): Promise<LocaNamespace> {
  if (locaPromise) return locaPromise;
  locaPromise = (async () => {
    const [config] = await Promise.all([loadBrowserConfig(), loadOfficialAmap()]);
    return waitForOfficialLoca(config);
  })().catch((error: unknown) => {
    locaPromise = null;
    if (error instanceof AmapUnavailableError) throw error;
    throw new AmapUnavailableError("SDK_UNAVAILABLE");
  });
  return locaPromise;
}
