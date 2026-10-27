"use client";

import { CloudCheck, CloudSlash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { PROJECT_DATA_CLEARED_EVENT } from "@/lib/accessibility-preferences";
import { OFFLINE_CACHE_STATUS_EVENT } from "./OfflinePackControl";

type CacheReadiness = {
  known: boolean;
  shellReady: boolean;
  offlinePackAvailable: boolean;
  offlinePackReady: boolean;
};

const UNKNOWN_CACHE_READINESS: CacheReadiness = { known: false, shellReady: false, offlinePackAvailable: false, offlinePackReady: false };

function parseCacheReadiness(value: unknown): CacheReadiness | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.shellReady !== "boolean" || typeof record.offlinePackAvailable !== "boolean" || typeof record.offlinePackReady !== "boolean") return null;
  return { known: true, shellReady: record.shellReady, offlinePackAvailable: record.offlinePackAvailable, offlinePackReady: record.offlinePackReady };
}

async function inspectOfflineCache(registration: ServiceWorkerRegistration | null): Promise<CacheReadiness> {
  const worker = navigator.serviceWorker.controller ?? registration?.active;
  if (!worker || typeof MessageChannel === "undefined") return UNKNOWN_CACHE_READINESS;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      resolve(UNKNOWN_CACHE_READINESS);
    }, 1800);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const value = event.data;
      resolve(parseCacheReadiness(value) ?? UNKNOWN_CACHE_READINESS);
    };
    worker.postMessage({ type: "GET_CACHE_STATUS" }, [channel.port2]);
  });
}

export function ConnectivityStatus() {
  const [online, setOnline] = useState(true);
  const [showRecovered, setShowRecovered] = useState(false);
  const [cacheReadiness, setCacheReadiness] = useState<CacheReadiness>(UNKNOWN_CACHE_READINESS);

  useEffect(() => {
    let active = true;
    const registrationPromise: Promise<ServiceWorkerRegistration | null> = "serviceWorker" in navigator && window.isSecureContext
      ? navigator.serviceWorker.register("/sw.js").catch(() => null)
      : Promise.resolve(null);

    async function refreshCacheReadiness() {
      const readiness = await inspectOfflineCache(await registrationPromise);
      if (active) setCacheReadiness(readiness);
    }

    async function verifyConnection(showRecovery = false) {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!active || !response.ok) return;
        setOnline((wasOnline) => {
          if (!wasOnline && showRecovery) {
            setShowRecovered(true);
            window.setTimeout(() => setShowRecovered(false), 3000);
          }
          return true;
        });
      } catch {
        if (active) {
          setOnline(false);
          setShowRecovered(false);
          void refreshCacheReadiness();
        }
      }
    }
    const handleOffline = () => { setOnline(false); setShowRecovered(false); void refreshCacheReadiness(); };
    const handleOnline = () => { void verifyConnection(true); };
    const handleCacheStatus = (event: Event) => {
      const next = parseCacheReadiness((event as CustomEvent<unknown>).detail);
      if (next) setCacheReadiness(next);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, refreshCacheReadiness);
    window.addEventListener(OFFLINE_CACHE_STATUS_EVENT, handleCacheStatus);
    void verifyConnection();
    return () => {
      active = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, refreshCacheReadiness);
      window.removeEventListener(OFFLINE_CACHE_STATUS_EVENT, handleCacheStatus);
    };
  }, []);

  if (online && !showRecovered) return null;
  const offlineMessage = !cacheReadiness.known
    ? "当前离线：正在核对缓存；AI 暂不可用"
    : !cacheReadiness.offlinePackAvailable
      ? "当前离线：没有已核验的正式离线导航包，导航已暂停；AI 暂不可用"
      : cacheReadiness.shellReady && cacheReadiness.offlinePackReady
      ? "当前离线：地图包已就绪；只有此前在线打开并加载完成的页面可继续使用，AI 暂不可用"
      : cacheReadiness.shellReady
        ? "当前离线：仅轻量入口兜底已缓存，地图包未完整下载；AI 暂不可用"
        : cacheReadiness.offlinePackReady
          ? "当前离线：地图包已缓存，但入口与页面脚本未确认；AI 暂不可用"
          : "当前离线：离线入口与地图包都未确认；已加载页面仍可能部分可用，AI 暂不可用";
  return <div role="status" className={`fixed left-1/2 top-20 [z-index:var(--z-toast)] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-2 text-xs font-medium shadow-lg ${online ? "bg-[#e4eee6] text-[#315944]" : "bg-[#fff0e5] text-[#8d493e]"}`}>{online ? <CloudCheck size={17} weight="duotone" className="shrink-0" /> : <CloudSlash size={17} weight="duotone" className="shrink-0" />}{online ? "网络已恢复" : offlineMessage}</div>;
}
