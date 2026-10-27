"use client";

import { Check, GearSix, SpeakerHigh, SpeakerSlash, TextAa, X } from "@phosphor-icons/react";
import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  ACCESSIBILITY_PREFERENCES_EVENT,
  ACCESSIBILITY_PREFERENCES_KEY,
  type AccessibilityPreferences,
  applyAccessibilityPreferences,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  PROJECT_DATA_CLEARED_EVENT,
  parseAccessibilityPreferences,
  readAccessibilityPreferences,
  writeAccessibilityPreferences,
} from "@/lib/accessibility-preferences";
import { OFFLINE_CACHE_REFRESH_EVENT, OfflinePackControl } from "./OfflinePackControl";

const fontOptions = [
  { value: "default", label: "标准" },
  { value: "large", label: "较大" },
  { value: "largest", label: "最大" },
] as const;

export function AccessibilityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [storageMessage, setStorageMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousPathRef = useRef(pathname);

  useEffect(() => {
    const result = readAccessibilityPreferences(window.localStorage);
    applyAccessibilityPreferences(result.preferences, document.documentElement);
    const initialLoadTimer = window.setTimeout(() => {
      setPreferences(result.preferences);
      setStorageMessage(result.error ?? "");
    }, 0);

    const sync = (event?: Event) => {
      if (event instanceof StorageEvent && event.key !== ACCESSIBILITY_PREFERENCES_KEY && event.key !== null) return;
      if (event?.type === ACCESSIBILITY_PREFERENCES_EVENT) {
        const direct = parseAccessibilityPreferences((event as CustomEvent<unknown>).detail);
        if (direct) {
          setPreferences(direct);
          applyAccessibilityPreferences(direct, document.documentElement);
          return;
        }
      }
      const next = readAccessibilityPreferences(window.localStorage);
      setPreferences(next.preferences);
      setStorageMessage(next.error ?? "");
      applyAccessibilityPreferences(next.preferences, document.documentElement);
    };
    window.addEventListener("storage", sync);
    window.addEventListener(ACCESSIBILITY_PREFERENCES_EVENT, sync);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, sync);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener("storage", sync);
      window.removeEventListener(ACCESSIBILITY_PREFERENCES_EVENT, sync);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (previousPathRef.current === pathname) return;
    previousPathRef.current = pathname;
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  function update(patch: Partial<AccessibilityPreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    applyAccessibilityPreferences(next, document.documentElement);
    const saved = writeAccessibilityPreferences(next, window.localStorage);
    setStorageMessage(saved ? "设置已保存在这台设备。" : "浏览器阻止保存；本次页面仍会使用此设置。 ");
    window.dispatchEvent(new CustomEvent(ACCESSIBILITY_PREFERENCES_EVENT, { detail: next }));
    if (next.muted) window.speechSynthesis?.cancel();
  }

  function openDialog() {
    dialogRef.current?.showModal();
    window.dispatchEvent(new Event(OFFLINE_CACHE_REFRESH_EVENT));
  }

  function closeDialog() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        className="accessibility-trigger fixed bottom-24 right-4 [z-index:var(--z-accessibility)] inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full border border-[#173f35]/18 bg-[#fffaf0] px-3 text-sm font-semibold text-[#173f35] shadow-[0_12px_35px_rgba(23,63,53,.2)] lg:bottom-5"
        aria-label="打开显示与辅助设置"
      >
        <GearSix size={22} weight="duotone" aria-hidden="true" />
        <span className="hidden xl:inline">显示与辅助</span>
      </button>
      <dialog
        ref={dialogRef}
        className="accessibility-dialog m-auto w-[min(92vw,34rem)] rounded-[2rem] border border-[#173f35]/15 bg-[#fffaf0] p-0 text-[#173f35] shadow-[0_28px_90px_rgba(16,43,35,.3)]"
        aria-labelledby="accessibility-title"
        onClose={() => triggerRef.current?.focus()}
      >
        <div className="max-h-[85dvh] overflow-y-auto p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#76551f]">Display & access</p><h2 id="accessibility-title" className="mt-2 text-2xl font-semibold">显示与辅助</h2><p className="mt-2 text-sm leading-6 text-[#52655c]">所有选择只保存在这台设备，可随时恢复。</p></div>
            <button type="button" onClick={closeDialog} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-[#173f35]/15" aria-label="关闭显示与辅助设置"><X size={21} /></button>
          </div>

          <fieldset className="mt-7"><legend className="flex items-center gap-2 font-semibold"><TextAa size={20} />文字大小</legend><div className="mt-3 grid grid-cols-3 gap-2">{fontOptions.map((option) => <button key={option.value} type="button" onClick={() => update({ fontScale: option.value })} aria-pressed={preferences.fontScale === option.value} className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${preferences.fontScale === option.value ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/15 bg-white/55"}`}>{option.label}</button>)}</div></fieldset>

          <div className="mt-6 divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
            <PreferenceToggle checked={preferences.highContrast} onChange={(checked) => update({ highContrast: checked })} title="增强对比度" description="加深正文与边界，减少浅灰小字。" />
            <PreferenceToggle checked={preferences.simplifiedVisuals} onChange={(checked) => update({ simplifiedVisuals: checked })} title="简洁显示与标准地图" description="减少纹理、阴影和装饰，并优先使用标准地图。" />
            <PreferenceToggle checked={preferences.muted} onChange={(checked) => update({ muted: checked })} title="全局静音" description="立即停止当前朗读，后续语音仍需你取消静音并主动播放。" icon={preferences.muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />} />
          </div>
          <OfflinePackControl />
          <p className="mt-5 min-h-6 text-sm text-[#52655c]" role="status">{storageMessage}</p>
          <button type="button" onClick={closeDialog} className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 text-sm font-semibold text-white"><Check size={18} />完成</button>
        </div>
      </dialog>
    </MotionConfig>
  );
}

function PreferenceToggle({ checked, onChange, title, description, icon }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string; icon?: ReactNode }) {
  return <label className="flex min-h-20 cursor-pointer items-center gap-4 py-4"><span className="shrink-0" aria-hidden="true">{icon}</span><span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="mt-1 block text-sm leading-5 text-[#52655c]">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-6 w-6 shrink-0 accent-[#173f35]" /></label>;
}
