"use client";

import { CheckCircle, CloudArrowDown, HardDrives, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { PROJECT_DATA_CLEARED_EVENT } from "@/lib/accessibility-preferences";
import { installFormalOfflinePack } from "@/lib/formal-offline-pack-client";

export const OFFLINE_CACHE_REFRESH_EVENT = "liuzu-cloud-tour:offline-cache-refresh";
export const OFFLINE_CACHE_STATUS_EVENT = "liuzu-cloud-tour:offline-cache-status";

type OfflineCacheStatus = {
  shellCacheName: string;
  offlinePackCacheName: string;
  shellReady: boolean;
  offlinePackAvailable: boolean;
  offlinePackReady: boolean;
  offlinePackUnavailableReason: string | null;
  shellMissing: string[];
  offlinePackMissing: string[];
  missing: string[];
};

type Phase = "checking" | "idle" | "downloading" | "unavailable" | "unsupported" | "error";

type OfflinePackControlProps = {
  scenicAreaId?: string;
  compact?: boolean;
  onInstalled?: () => void;
};

function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function parseCacheStatus(value: unknown): OfflineCacheStatus | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!["CACHE_STATUS", "OFFLINE_PACK_COMPLETE", "OFFLINE_PACK_ERROR", "OFFLINE_PACK_UNAVAILABLE"].includes(String(record.type))) return null;
  const shellMissing = readStringArray(record.shellMissing);
  const offlinePackMissing = readStringArray(record.offlinePackMissing);
  const missing = readStringArray(record.missing);
  if (
    typeof record.shellCacheName !== "string" ||
    typeof record.offlinePackCacheName !== "string" ||
    typeof record.shellReady !== "boolean" ||
    typeof record.offlinePackAvailable !== "boolean" ||
    typeof record.offlinePackReady !== "boolean" ||
    (record.offlinePackUnavailableReason !== null && typeof record.offlinePackUnavailableReason !== "string") ||
    !shellMissing ||
    !offlinePackMissing ||
    !missing
  ) return null;
  return {
    shellCacheName: record.shellCacheName,
    offlinePackCacheName: record.offlinePackCacheName,
    shellReady: record.shellReady,
    offlinePackAvailable: record.offlinePackAvailable,
    offlinePackReady: record.offlinePackReady,
    offlinePackUnavailableReason: record.offlinePackUnavailableReason,
    shellMissing,
    offlinePackMissing,
    missing,
  };
}

async function resolveServiceWorker(): Promise<ServiceWorker | null> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    const registration = existing ?? await navigator.serviceWorker.register("/sw.js");
    const immediate = navigator.serviceWorker.controller ?? registration.active;
    if (immediate) return immediate;
    let timeoutId = 0;
    const timeout = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), 3500);
    });
    const ready = await Promise.race([navigator.serviceWorker.ready, timeout]);
    window.clearTimeout(timeoutId);
    return ready ? navigator.serviceWorker.controller ?? ready.active : null;
  } catch {
    return null;
  }
}

async function requestCacheStatus(): Promise<OfflineCacheStatus | null> {
  const worker = await resolveServiceWorker();
  if (!worker || typeof MessageChannel === "undefined") return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, 2500);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(parseCacheStatus(event.data));
    };
    worker.postMessage({ type: "GET_CACHE_STATUS" }, [channel.port2]);
  });
}

function publishStatus(status: OfflineCacheStatus) {
  window.dispatchEvent(new CustomEvent(OFFLINE_CACHE_STATUS_EVENT, { detail: status }));
}

export function OfflinePackControl({
  scenicAreaId = "liuzu-town",
  compact = false,
  onInstalled,
}: OfflinePackControlProps = {}) {
  const titleId = `offline-pack-title-${useId().replace(/:/g, "")}`;
  const [phase, setPhase] = useState<Phase>("checking");
  const [status, setStatus] = useState<OfflineCacheStatus | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setPhase((current) => current === "downloading" ? current : "checking");
      const next = await requestCacheStatus();
      if (!active) return;
      if (!next) {
        setPhase("unsupported");
        setMessage("当前环境无法使用离线缓存；请使用支持 Service Worker 的安全网页环境。");
        return;
      }
      setStatus(next);
      setPhase("idle");
      setMessage(next.offlinePackReady ? "" : "本机尚未安装当前有效的正式离线包，可联网检查并下载。");
      publishStatus(next);
    };
    const handleRefresh = () => { void refresh(); };
    const initialTimer = window.setTimeout(handleRefresh, 0);
    window.addEventListener(OFFLINE_CACHE_REFRESH_EVENT, handleRefresh);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, handleRefresh);
    window.addEventListener("online", handleRefresh);
    navigator.serviceWorker?.addEventListener("controllerchange", handleRefresh);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.removeEventListener(OFFLINE_CACHE_REFRESH_EVENT, handleRefresh);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, handleRefresh);
      window.removeEventListener("online", handleRefresh);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleRefresh);
    };
  }, []);

  async function refresh() {
    setPhase("checking");
    setMessage("");
    const next = await requestCacheStatus();
    if (!next) {
      setPhase("unsupported");
      setMessage("无法读取离线缓存状态，请刷新页面后重试。");
      return;
    }
    setStatus(next);
    setPhase("idle");
    setMessage(next.offlinePackReady ? "离线地图包仍完整有效。" : "本机尚未安装当前有效的正式离线包，可联网检查并下载。");
    publishStatus(next);
  }

  async function download() {
    if (!navigator.onLine) {
      setPhase("error");
      setMessage("当前没有网络，无法下载；已保留此前成功缓存的文件。");
      return;
    }
    const worker = await resolveServiceWorker();
    if (!worker || !("caches" in window)) {
      setPhase("unsupported");
      setMessage("当前环境无法启动离线下载，请刷新页面或改用支持离线缓存的浏览器。");
      return;
    }
    setPhase("downloading");
    setProgress({ completed: 0, total: 0 });
    setMessage("正在验证签名并逐项下载，请保持页面打开。");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10 * 60_000);
    const result = await installFormalOfflinePack(scenicAreaId, {
      signal: controller.signal,
      onProgress: ({ completed, total }) => setProgress({ completed, total }),
    });
    window.clearTimeout(timeout);
    if (!result.ok) {
      setPhase(result.code === "PACK_UNAVAILABLE" || result.code === "MANIFEST_REJECTED" ? "unavailable" : "error");
      setMessage(result.message);
      return;
    }
    const next = await requestCacheStatus();
    if (!next?.offlinePackReady) {
      setPhase("error");
      setMessage("文件已下载，但后台复核未确认当前包可用；没有启用离线导航。");
      return;
    }
    setStatus(next);
    publishStatus(next);
    setPhase("idle");
    setMessage(`离线地图包已完成签名与 ${next.offlinePackMissing.length === 0 ? "全部文件" : "文件"}核对。`);
    onInstalled?.();
  }

  const missingCount = status?.offlinePackMissing.length ?? 0;
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const ready = status?.offlinePackReady === true;
  const unavailable = phase === "unavailable";
  const notInstalled = status?.offlinePackAvailable === false;

  return (
    <section
      className={`${compact ? "rounded-2xl border border-[#173f35]/12 bg-[#f4f7f3] p-4" : "mt-6 rounded-2xl border border-[#173f35]/14 bg-white/45 p-4"}`}
      aria-labelledby={titleId}
      data-offline-pack-control={compact ? "navigation" : "settings"}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4eee6] text-[#315944]" aria-hidden="true"><HardDrives size={21} weight="duotone" /></span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-semibold">离线地图包</h3>
          <p className="mt-1 text-sm leading-6 text-[#52655c]">{compact ? "出发前联网下载当前正式路网、运营状态、景点与矢量底图，断网后仍可在本机规划和导航。" : "仅可下载已获权利、已发布并完成现场核验的正式数据包；当前候选数据不会被缓存为离线导航。"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-[#f5f0e5] px-4 py-3 text-sm leading-6" aria-live="polite">
        {phase === "checking" && "正在核对离线缓存…"}
        {phase !== "checking" && ready && <span className="inline-flex items-center gap-2 font-medium text-[#315944]"><CheckCircle size={18} weight="fill" />地图数据包已就绪</span>}
        {phase !== "checking" && unavailable && <span className="inline-flex items-center gap-2 text-[#8b302a]"><WarningCircle size={18} weight="duotone" />当前没有可安装的正式离线包</span>}
        {phase !== "checking" && !ready && !unavailable && status && <span className="inline-flex items-center gap-2 text-[#745126]"><WarningCircle size={18} weight="duotone" />{notInstalled ? "本机尚未安装正式地图包" : `地图包尚缺 ${missingCount} 个文件`}</span>}
        {phase === "unsupported" && !status && "无法使用离线缓存。"}
        {status && <p className="mt-1 text-xs text-[#52655c]">{status.shellReady ? "轻量入口兜底已缓存。" : "轻量入口兜底尚未就绪。"}</p>}
      </div>

      {phase === "downloading" && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-medium"><span>下载并逐项核对</span><span>{progress.completed}/{progress.total || "待计算"}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dce5de]" role="progressbar" aria-label="离线地图包下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span className="block h-full rounded-full bg-[#315944] transition-transform" style={{ transform: `translateX(${percent - 100}%)` }} /></div>
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-[#52655c]">离线包不包含 AI、外部底图、候选 GIS 或实时开放信息。正式包的数据与封路状态过期时，导航必须停止并提示人工求助。</p>
      {message && <p className={`mt-3 text-sm leading-6 ${phase === "error" || phase === "unsupported" || phase === "unavailable" ? "text-[#8b302a]" : "text-[#315944]"}`} role="status">{message}</p>}
      <button
        type="button"
        onClick={ready ? () => void refresh() : () => void download()}
        disabled={phase === "checking" || phase === "downloading" || phase === "unsupported"}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#173f35]/18 bg-[#173f35] px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-55"
      >
        <CloudArrowDown size={19} weight="duotone" />
        {phase === "downloading" ? "正在验签并下载" : unavailable ? "重新检查正式离线包" : ready ? "重新核对离线包" : "检查并下载离线地图包"}
      </button>
    </section>
  );
}
