"use client";

import { DownloadSimple, ShareNetwork, X } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./PwaInstallPrompt.module.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallMode = "HIDDEN" | "BROWSER_PROMPT" | "IOS_GUIDE";

const DISMISS_KEY = "liuzu-pwa-install-dismissed-v1";

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<InstallMode>("HIDDEN");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
      setInstallEvent(event as BeforeInstallPromptEvent);
      setMode("BROWSER_PROMPT");
    };
    const frame = window.requestAnimationFrame(() => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches
        || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      const ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
      const dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
      if (!standalone && ios && !dismissed) setMode("IOS_GUIDE");
    });
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  if (
    mode === "HIDDEN"
    || pathname.startsWith("/admin")
    || pathname.startsWith("/account")
    || pathname.startsWith("/share")
  ) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setMode("HIDDEN");
    setInstallEvent(null);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") dismiss();
  }

  return (
    <aside className={styles.prompt} data-pwa-install-prompt data-mode={mode} aria-live="polite">
      <button type="button" className={styles.close} onClick={dismiss} aria-label="暂不显示安装提示"><X size={16} /></button>
      <span className={styles.icon} aria-hidden="true">{mode === "IOS_GUIDE" ? <ShareNetwork size={21} weight="duotone" /> : <DownloadSimple size={21} weight="duotone" />}</span>
      <div className={styles.copy}>
        <strong>安装六祖云游到主屏幕</strong>
        {mode === "IOS_GUIDE"
          ? <p>在 Safari 点“分享”，再选“添加到主屏幕”。</p>
          : <p>获得独立窗口和更顺手的手机入口；正式离线导航仍未开放。</p>}
      </div>
      {mode === "BROWSER_PROMPT" ? <button type="button" className={styles.action} onClick={install}>安装</button> : null}
    </aside>
  );
}
