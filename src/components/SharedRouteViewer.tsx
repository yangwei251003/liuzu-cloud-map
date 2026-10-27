"use client";

import {
  ArrowLeft,
  CheckCircle,
  Copy,
  Hourglass,
  LockKey,
  MapPin,
  Path,
  ShareNetwork,
  ShieldWarning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ROUTE_SHARE_STORAGE_KEY,
  decodeRouteShareToken,
  readRouteShareRegistry,
  type RouteSharePayload,
} from "@/lib/route-share";
import {
  buildServerRouteShareUrl,
  clearLegacyServerRouteShareTokens,
  isServerRouteShareToken,
  parseReadServerRouteShare,
} from "@/lib/server-route-share";
import { parseVisitorApiError } from "@/lib/visitor-account";

type ViewerPayload = Pick<RouteSharePayload, "expiresAt" | "route">;

type ViewerState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "unavailable"; message: string }
  | { kind: "valid"; payload: ViewerPayload; source: "local" | "server"; shareUrl: string | null; revocationWarning: string | null };

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy_failed");
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function BlockedShare({ kind, message, onRetry }: { kind: "invalid" | "expired" | "revoked" | "unavailable"; message?: string; onRetry?: () => void }) {
  const content = {
    invalid: {
      eyebrow: "Invalid link",
      title: "这条分享无法打开",
      description: message ?? "链接内容不完整、已损坏或被改动。为保护你的体验，我们没有展示其中的信息。",
    },
    expired: {
      eyebrow: "Expired link",
      title: "这条路线分享已到期",
      description: "只读分享默认保留 7 天。到期后路线内容会被阻断，请联系分享者重新生成链接。",
    },
    revoked: {
      eyebrow: "Revoked",
      title: "分享者已撤销这条链接",
      description: "撤销状态已生效，这条路线不再展示。服务端链接会跨设备阻断；本机演示链接只在创建者的同一浏览器中阻断。",
    },
    unavailable: {
      eyebrow: "Temporarily unavailable",
      title: "暂时无法核对这条分享",
      description: message ?? "网络或分享服务暂时不可用。为避免展示过期或已撤销内容，页面已停止显示路线。",
    },
  }[kind];

  return (
    <main className="paper-noise grid min-h-[100dvh] place-items-center px-4 py-12 text-[#173f35]">
      <section className="w-full max-w-xl border-y border-[#173f35]/14 py-12 text-center" role="alert">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#a75a4c]/20 bg-[#fff1e9] text-[#955043]">
          <ShieldWarning size={28} weight="duotone" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[.22em] text-[#9b7a42]">{content.eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-5xl">{content.title}</h1>
        <p className="mx-auto mt-5 max-w-[48ch] text-sm leading-7 text-[#65766f]">{content.description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {kind === "unavailable" && onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center rounded-full bg-[#173f35] px-5 py-3 text-sm font-medium text-white active:scale-[0.98]">重新核对</button>}
          <Link href="/" className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium active:scale-[0.98] ${kind === "unavailable" ? "border border-[#173f35]/16 bg-white/55" : "bg-[#173f35] text-white"}`}>
            <ArrowLeft size={18} aria-hidden="true" />回到探索地图
          </Link>
        </div>
      </section>
    </main>
  );
}

export function SharedRouteViewer() {
  const [state, setState] = useState<ViewerState>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const serverShareTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const inspect = async () => {
      setNotice(null);
      clearLegacyServerRouteShareTokens();
      const url = new URL(window.location.href);
      if (url.search) {
        serverShareTokenRef.current = null;
        window.history.replaceState(window.history.state, "", url.pathname);
        setState({ kind: "invalid", message: "服务端分享凭据只能位于网址片段中，查询参数不会被解析。" });
        return;
      }

      const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : "";
      let token = serverShareTokenRef.current;
      if (fragment.length > 0) {
        token = isServerRouteShareToken(fragment) ? fragment : null;
        if (!token) serverShareTokenRef.current = null;
      }
      if (token) {
        const shareUrl = buildServerRouteShareUrl(token, url.origin);
        serverShareTokenRef.current = token;
        if (fragment) window.history.replaceState(window.history.state, "", url.pathname);
        setState({ kind: "loading" });
        try {
          const response = await fetch("/api/v1/shared-routes/resolve", {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
            signal: controller.signal,
          });
          const body = (await response.json()) as unknown;
          if (response.ok) {
            const parsed = parseReadServerRouteShare(body);
            if (!parsed) {
              setState({ kind: "invalid", message: "服务端路线没有通过严格字段校验，页面未展示内容。" });
              return;
            }
            setState({
              kind: "valid",
              source: "server",
              shareUrl,
              payload: {
                expiresAt: parsed.expiresAt,
                route: {
                  title: parsed.route.title,
                  duration: parsed.route.duration,
                  pace: parsed.route.pace,
                  stops: parsed.route.stops.map((stop) => ({ id: stop.id, name: stop.name })),
                },
              },
              revocationWarning: null,
            });
            return;
          }
          const apiError = parseVisitorApiError(body);
          if (response.status === 410 && apiError?.code === "EXPIRED") {
            setState({ kind: "expired" });
            return;
          }
          if (response.status === 410 && apiError?.code === "REVOKED") {
            setState({ kind: "revoked" });
            return;
          }
          if (response.status === 404) {
            setState({ kind: "invalid", message: "没有找到可用的服务端分享；链接可能已损坏。" });
            return;
          }
          setState({ kind: "unavailable", message: apiError?.message ?? "暂时无法核对服务端分享状态。" });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setState({ kind: "unavailable", message: "网络连接中断，无法核对链接是否仍然有效或已被撤销。" });
          }
        }
        return;
      }

      const decoded = decodeRouteShareToken(window.location.hash);
      if (decoded.status === "invalid") {
        setState({ kind: "invalid", message: decoded.reason });
        return;
      }
      if (decoded.status === "expired") {
        setState({ kind: "expired" });
        return;
      }

      const local = readRouteShareRegistry();
      const matchingRecord = local.registry.records.find((record) => record.shareId === decoded.payload.shareId);
      if (matchingRecord?.revokedAt) {
        setState({ kind: "revoked" });
        return;
      }
      setState({
        kind: "valid",
        source: "local",
        shareUrl: null,
        payload: decoded.payload,
        revocationWarning: local.error
          ? "当前浏览器无法检查本机撤销记录；页面仅按自包含网址片段展示。"
          : null,
      });
    };

    void inspect();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ROUTE_SHARE_STORAGE_KEY || event.key === null) void inspect();
    };
    const handleLocationChange = () => void inspect();
    window.addEventListener("hashchange", handleLocationChange);
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      controller.abort();
      window.removeEventListener("hashchange", handleLocationChange);
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [retryNonce]);

  async function shareCurrentLink() {
    if (state.kind !== "valid") return;
    const url = state.source === "server" ? state.shareUrl : window.location.href;
    if (!url) {
      setNotice("这条跨设备链接只能在首次打开的当前页面内复制，请联系分享者重新发送链接。");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: state.payload.route.title, text: state.source === "server" ? "一条来自六祖云游的 7 天跨设备只读路线" : "一条来自六祖云游的 7 天本机演示只读路线", url });
        setNotice("已打开系统分享面板。");
      } else {
        await copyText(url);
        setNotice("当前浏览器没有系统分享，链接已复制。");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyText(url);
        setNotice("系统分享未完成，链接已改为复制。");
      } catch {
        setNotice("无法调用系统分享或剪贴板，请从地址栏手动复制链接。");
      }
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="paper-noise min-h-[100dvh] px-4 py-10" aria-busy="true" aria-label="正在验证路线分享">
        <div className="mx-auto max-w-3xl animate-pulse motion-reduce:animate-none">
          <div className="h-10 w-36 rounded-full bg-[#173f35]/8" />
          <div className="mt-20 h-4 w-28 rounded bg-[#173f35]/8" />
          <div className="mt-5 h-14 max-w-lg rounded bg-[#173f35]/8" />
          <div className="mt-12 h-72 rounded-[2rem] bg-[#173f35]/7" />
        </div>
      </main>
    );
  }
  if (state.kind === "invalid") return <BlockedShare kind="invalid" message={state.message} />;
  if (state.kind === "expired") return <BlockedShare kind="expired" />;
  if (state.kind === "revoked") return <BlockedShare kind="revoked" />;
  if (state.kind === "unavailable") return <BlockedShare kind="unavailable" message={state.message} onRetry={() => setRetryNonce((value) => value + 1)} />;

  const { payload, source } = state;
  return (
    <main className="paper-noise min-h-[100dvh] overflow-hidden text-[#173f35]">
      <header className="border-b border-[#173f35]/10 bg-[#f7f1e7]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium">
            <ArrowLeft size={18} aria-hidden="true" />探索地图
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#173f35]/12 bg-white/55 px-3 py-2 text-xs font-medium">
            <LockKey size={16} weight="duotone" aria-hidden="true" />{source === "server" ? "跨设备只读" : "本机演示只读"}
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-[.72fr_1.28fr] md:px-8 md:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#9b7a42]">Shared quiet route</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] md:text-6xl">{payload.route.title}</h1>
          <p className="mt-6 max-w-[46ch] text-sm leading-7 text-[#63756c]">
            分享者只公开了路线名称、途经地点、时长与节奏。原始游记、计划日期和同行备注均未包含在链接中。{source === "server" ? "此页面每次都会核对链接是否有效或已撤销。" : "此页面来自本机生成的只读链接，不会把路线再次上传。"}
          </p>
          <button type="button" onClick={() => void shareCurrentLink()} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-medium text-white active:scale-[0.98]">
            <ShareNetwork size={18} aria-hidden="true" />分享这条只读链接
          </button>
          <div className="min-h-8 pt-3 text-sm text-[#56725f]" aria-live="polite">
            {notice && <span className="inline-flex items-center gap-2"><CheckCircle size={17} weight="fill" aria-hidden="true" />{notice}</span>}
          </div>
        </div>

        <article className="rounded-[2rem] border border-[#173f35]/10 bg-white/50 p-6 shadow-[0_28px_70px_rgba(23,63,53,.09)] md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#173f35]/10 pb-5">
            <span className="inline-flex items-center gap-2 text-sm font-semibold"><Path size={20} weight="duotone" aria-hidden="true" />只读路线预览</span>
            <span className="inline-flex items-center gap-2 text-xs text-[#6c7c74]"><Hourglass size={16} aria-hidden="true" />有效至 {formatExpiry(payload.expiresAt)}</span>
          </div>
          <dl className="mt-6 grid grid-cols-2 divide-x divide-[#173f35]/12 border-y border-[#173f35]/12 py-4">
            <div className="pr-4"><dt className="text-xs text-[#718078]">预计时长</dt><dd className="mt-1 text-lg font-semibold">{payload.route.duration}</dd></div>
            <div className="pl-4"><dt className="text-xs text-[#718078]">游览节奏</dt><dd className="mt-1 text-lg font-semibold">{payload.route.pace}</dd></div>
          </dl>
          <ol className="mt-7 space-y-0" aria-label="分享路线的途经地点">
            {payload.route.stops.map((stop, index) => (
              <li key={stop.id} className="grid grid-cols-[32px_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#b88a43]/35 bg-[#f5ead7] text-xs font-semibold text-[#886832]">{index + 1}</span>
                  {index < payload.route.stops.length - 1 && <span className="h-8 w-px bg-[#b88a43]/24" aria-hidden="true" />}
                </div>
                <span className="pt-1.5 text-sm font-medium">{stop.name}</span>
              </li>
            ))}
          </ol>
          <div className="mt-7 border-t border-[#173f35]/10 pt-5 text-xs leading-6 text-[#6a7972]">
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0 text-[#9b7a42]" size={16} aria-hidden="true" />地点与顺序仅供行前计划参考，开放状态和道路通行情况请以现场信息为准。</p>
            <p className="mt-2 flex items-start gap-2"><Copy className="mt-0.5 shrink-0 text-[#9b7a42]" size={16} aria-hidden="true" />此页面不提供“复制为草稿”或编辑入口。</p>
          </div>
        </article>
      </section>

      <aside className="mx-auto max-w-5xl px-4 pb-14 md:px-8" aria-label="分享撤销说明">
        <div className="border-y border-[#173f35]/12 py-5 text-xs leading-6 text-[#65766f]">
          <strong className="text-[#173f35]">撤销边界：</strong>{source === "server" ? "这是服务端分享。创建者使用原游客账号远程撤销后，所有设备再次打开都会被阻断；链接也会在 7 天后自动失效。" : "这是本机演示分享。创建者撤销后，只能阻断同一站点、同一浏览器中的查看；已经发到其他设备的链接无法被远程收回，仍会在 7 天后自动失效。"}
          {state.revocationWarning && <p className="mt-2 text-[#8b5146]">{state.revocationWarning}</p>}
        </div>
      </aside>
    </main>
  );
}
