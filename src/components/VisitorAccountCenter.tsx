"use client";

import {
  ArrowRight,
  CheckCircle,
  CloudCheck,
  CloudSlash,
  Key,
  ShieldCheck,
  SignIn,
  SignOut,
  UserCircle,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { SectionHeader } from "./PageShell";
import {
  VISITOR_AUTH_STATE_EVENT,
  parseVisitorApiError,
  parseVisitorSessionResponse,
  validateVisitorCredentials,
  type VisitorSummary,
} from "@/lib/visitor-account";

type AccountState =
  | { kind: "checking" }
  | { kind: "disabled"; message: string }
  | { kind: "signed-out" }
  | { kind: "signed-in"; visitor: VisitorSummary; expiresAt: string | null }
  | { kind: "error"; message: string };

const fieldClass =
  "w-full rounded-xl border border-[#173f35]/16 bg-white/72 px-4 py-3.5 text-base text-[#173f35] outline-none transition-colors placeholder:text-[#66776f] focus:border-[#b88a43] disabled:cursor-not-allowed disabled:opacity-55";

function formatSessionExpiry(value: string | null) {
  if (!value) return "会话有效期由安全 Cookie 管理";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "会话有效期无法显示";
  return `本次会话预计有效至 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)}`;
}

export function VisitorAccountCenter() {
  const [state, setState] = useState<AccountState>({ kind: "checking" });
  const [mode, setMode] = useState<"login" | "register">("login");
  const [handle, setHandle] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inspectSession = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as unknown;
      if (response.ok) {
        const parsed = parseVisitorSessionResponse(body);
        setState(parsed
          ? { kind: "signed-in", visitor: parsed.visitor, expiresAt: parsed.expiresAt }
          : { kind: "error", message: "账号服务返回了无法识别的数据，页面已停止显示登录状态。" });
        return;
      }
      const error = parseVisitorApiError(body);
      if (response.status === 401 && error?.code === "AUTH_REQUIRED") {
        setState({ kind: "signed-out" });
        return;
      }
      if (response.status === 503 && error?.code === "CAPABILITY_DISABLED") {
        setState({ kind: "disabled", message: error.message });
        return;
      }
      setState({ kind: "error", message: error?.message ?? "暂时无法核对账号状态，请稍后重试。" });
    } catch {
      setState({ kind: "error", message: "网络连接中断，无法核对账号状态；本机旅程仍可继续使用。" });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void inspectSession(), 0);
    return () => window.clearTimeout(timer);
  }, [inspectSession]);

  function changeMode(next: "login" | "register") {
    setMode(next);
    setPassphrase("");
    setConfirmation("");
    setFormError(null);
    setNotice(null);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const validated = validateVisitorCredentials(handle, passphrase);
    if (!validated.ok) {
      setFormError(validated.error);
      return;
    }
    if (mode === "register" && passphrase !== confirmation) {
      setFormError("两次输入的口令不一致，请重新核对。 ");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(validated.credentials),
      });
      const body = (await response.json()) as unknown;
      if (response.ok) {
        const parsed = parseVisitorSessionResponse(body);
        if (!parsed) {
          setFormError("账号服务返回了无法识别的数据，未在页面上声称登录成功。 ");
          return;
        }
        setState({ kind: "signed-in", visitor: parsed.visitor, expiresAt: parsed.expiresAt });
        setHandle(parsed.visitor.handle);
        setNotice(mode === "register" ? "游客账号已建立并登录。" : "已安全登录。 ");
        window.dispatchEvent(new Event(VISITOR_AUTH_STATE_EVENT));
        return;
      }
      const error = parseVisitorApiError(body);
      if (response.status === 503 && error?.code === "CAPABILITY_DISABLED") {
        setState({ kind: "disabled", message: error.message });
        return;
      }
      setFormError(
        response.status === 429
          ? "尝试次数较多，请约 15 分钟后再试。为保护隐私，页面不会说明账号是否存在。"
          : error?.message ?? "暂时无法完成请求，请稍后再试。",
      );
    } catch {
      setFormError("网络连接中断，登录信息没有得到成功确认。 ");
    } finally {
      setPassphrase("");
      setConfirmation("");
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    setFormError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        const error = parseVisitorApiError(body);
        setFormError(error?.message ?? "暂时无法退出，请稍后重试。 ");
        return;
      }
      setState({ kind: "signed-out" });
      setMode("login");
      setHandle("");
      setNotice("已退出当前游客账号；这台设备上的本地旅程没有被删除。 ");
      window.dispatchEvent(new Event(VISITOR_AUTH_STATE_EVENT));
    } catch {
      setFormError("网络连接中断，无法确认服务端会话已退出。 ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-20">
      <section className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-start lg:gap-16">
        <div>
          <SectionHeader
            level={1}
            className="section-header--cultural"
            meta="Visitor account"
            title="需要跨设备时，再登录"
            description="游客账号只为服务端只读分享提供身份与撤销能力。路线、游记、印章和知识卡仍默认留在当前浏览器，不会因登录自动上传。"
          />
          <div className="mt-8 divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
            <p className="flex gap-3 py-4 text-sm leading-6"><ShieldCheck className="mt-0.5 shrink-0 text-[#5d7d65]" size={20} weight="duotone" aria-hidden="true" />会话保存在 HttpOnly 安全 Cookie 中，页面脚本不能读取会话令牌。</p>
            <p className="flex gap-3 py-4 text-sm leading-6"><Key className="mt-0.5 shrink-0 text-[#5d7d65]" size={20} weight="duotone" aria-hidden="true" />口令只在提交登录或注册时发送；页面不会写入本地存储，也不会在提交后保留输入值。</p>
            <p className="flex gap-3 py-4 text-sm leading-6"><CloudCheck className="mt-0.5 shrink-0 text-[#5d7d65]" size={20} weight="duotone" aria-hidden="true" />登录后主动分享的最小路线快照可跨设备读取，并可由创建者远程撤销。</p>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/journey" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]">查看我的旅程<ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/privacy" className="inline-flex min-h-12 items-center rounded-full border border-[#173f35]/16 bg-white/45 px-5 py-3 text-sm font-semibold active:scale-[0.98]">数据与隐私</Link>
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-[#173f35]/10 bg-white/52 shadow-[0_28px_80px_rgba(23,63,53,.1)]" aria-label="游客账号状态与操作">
          {state.kind === "checking" && (
            <div className="animate-pulse p-6 motion-reduce:animate-none md:p-8" aria-busy="true" aria-label="正在核对账号能力">
              <div className="h-12 w-12 rounded-full bg-[#173f35]/8" />
              <div className="mt-7 h-7 w-40 rounded bg-[#173f35]/8" />
              <div className="mt-4 h-12 rounded-xl bg-[#173f35]/7" />
              <div className="mt-3 h-12 rounded-xl bg-[#173f35]/7" />
              <span className="sr-only">正在核对游客账号能力与当前会话。</span>
            </div>
          )}

          {state.kind === "disabled" && (
            <div className="p-6 md:p-8" role="status">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-[#b88a43]/28 bg-[#f7ead7] text-[#76551f]"><CloudSlash size={27} weight="duotone" aria-hidden="true" /></span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[.2em] text-[#76551f]">Local mode</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">账号能力尚未启用</h2>
              <p className="mt-4 text-sm leading-7 text-[#607169]">{state.message}</p>
              <p className="mt-3 text-sm leading-7 text-[#607169]">你仍可完整使用本机路线、导览、印章与游记，并生成明确标注为“本机演示”的自包含分享链接。</p>
              <button type="button" onClick={() => { setState({ kind: "checking" }); void inspectSession(); }} className="mt-6 inline-flex min-h-12 items-center rounded-full border border-[#173f35]/16 px-5 py-3 text-sm font-semibold active:scale-[0.98]">重新检查</button>
            </div>
          )}

          {state.kind === "error" && (
            <div className="p-6 md:p-8" role="alert">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-[#9b453c]/20 bg-[#fff0e7] text-[#8d493e]"><WarningCircle size={27} weight="duotone" aria-hidden="true" /></span>
              <h2 className="mt-6 text-2xl font-semibold tracking-[-.04em]">无法确认账号状态</h2>
              <p className="mt-4 text-sm leading-7 text-[#674f48]">{state.message}</p>
              <button type="button" onClick={() => { setState({ kind: "checking" }); void inspectSession(); }} className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#173f35] px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]">重新核对</button>
            </div>
          )}

          {state.kind === "signed-in" && (
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[#173f35] text-white"><UserCircle size={29} weight="duotone" aria-hidden="true" /></span>
                <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#76551f]">Signed in</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">{state.visitor.handle}</h2></div>
              </div>
              <div className="mt-7 rounded-[1.4rem] border border-[#5d7d65]/18 bg-[#edf3eb] p-5">
                <p className="flex items-center gap-2 font-semibold text-[#315443]"><CheckCircle size={20} weight="fill" aria-hidden="true" />跨设备只读分享已可用</p>
                <p className="mt-2 text-sm leading-6 text-[#526b5f]">{formatSessionExpiry(state.expiresAt)}。返回“我的旅程”，主动分享路线时会优先创建可远程撤销的服务端链接。</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link href="/community" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]"><ArrowRight size={18} aria-hidden="true" />进入地点社区</Link>
                <Link href={`/profile/${encodeURIComponent(state.visitor.handle)}`} className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#173f35]/16 px-5 py-3 text-sm font-semibold active:scale-[0.98]">查看旅行档案</Link>
              </div>
              {formError && <p className="mt-5 text-sm leading-6 text-[#8d493e]" role="alert">{formError}</p>}
              <button type="button" onClick={() => void logout()} disabled={submitting} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#9b453c]/22 px-5 py-3 text-sm font-semibold text-[#8d493e] active:scale-[0.98] disabled:cursor-wait disabled:opacity-55"><SignOut size={19} aria-hidden="true" />{submitting ? "正在安全退出" : "退出游客账号"}</button>
            </div>
          )}

          {state.kind === "signed-out" && (
            <div>
              <div className="grid grid-cols-2 border-b border-[#173f35]/10 p-2" aria-label="登录或注册">
                <button type="button" aria-pressed={mode === "login"} onClick={() => changeMode("login")} className={`min-h-12 rounded-xl text-sm font-semibold ${mode === "login" ? "bg-[#173f35] text-white" : "text-[#52685e]"}`}>登录</button>
                <button type="button" aria-pressed={mode === "register"} onClick={() => changeMode("register")} className={`min-h-12 rounded-xl text-sm font-semibold ${mode === "register" ? "bg-[#173f35] text-white" : "text-[#52685e]"}`}>建立账号</button>
              </div>
              <form className="p-6 md:p-8" onSubmit={submitCredentials} noValidate>
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#f0e5d4] text-[#76551f]">{mode === "login" ? <SignIn size={22} weight="duotone" aria-hidden="true" /> : <UserPlus size={22} weight="duotone" aria-hidden="true" />}</span><div><h2 className="text-xl font-semibold">{mode === "login" ? "继续管理跨设备分享" : "建立轻量游客账号"}</h2><p className="mt-1 text-xs text-[#607169]">不需要手机号或邮箱</p></div></div>
                <div className="mt-7 grid gap-5">
                  <div className="grid gap-2">
                    <label htmlFor="visitor-handle" className="text-sm font-semibold">账号名</label>
                    <input id="visitor-handle" value={handle} onChange={(event) => { setHandle(event.target.value); setFormError(null); }} className={fieldClass} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={32} placeholder="例如 quiet_walker" />
                    <p className="text-xs leading-5 text-[#607169]">3 至 32 位小写字母、数字、下划线或短横线；提交时会自动转为小写。</p>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="visitor-passphrase" className="text-sm font-semibold">{mode === "login" ? "口令" : "设置长口令"}</label>
                    <input id="visitor-passphrase" type="password" value={passphrase} onChange={(event) => { setPassphrase(event.target.value); setFormError(null); }} className={fieldClass} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} placeholder="至少 12 个字符" />
                  </div>
                  {mode === "register" && (
                    <div className="grid gap-2">
                      <label htmlFor="visitor-passphrase-confirm" className="text-sm font-semibold">再次输入口令</label>
                      <input id="visitor-passphrase-confirm" type="password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setFormError(null); }} className={fieldClass} autoComplete="new-password" minLength={12} maxLength={128} placeholder="再次输入，避免注册后无法找回" />
                    </div>
                  )}
                </div>
                {formError && <p className="mt-5 text-sm leading-6 text-[#8d493e]" role="alert">{formError}</p>}
                <button type="submit" disabled={submitting} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:cursor-wait disabled:opacity-55">{mode === "login" ? <SignIn size={19} aria-hidden="true" /> : <UserPlus size={19} aria-hidden="true" />}{submitting ? "正在安全核对" : mode === "login" ? "登录游客账号" : "建立账号并登录"}</button>
                <p className="mt-4 text-xs leading-6 text-[#607169]">为保护账号安全，账号不存在、口令错误或注册冲突都会返回概括提示。当前暂不提供口令找回，请妥善保管。</p>
              </form>
            </div>
          )}
        </section>
      </section>

      <div className="min-h-10 pt-6 text-sm text-[#456b58]" aria-live="polite" aria-atomic="true">
        {notice && <p className="flex items-center gap-2"><CheckCircle size={18} weight="fill" aria-hidden="true" />{notice}</p>}
      </div>
    </div>
  );
}
