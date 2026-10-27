"use client";

import { ClockCounterClockwise, SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readRemoteNavigationHistory, type RemoteNavigationSession } from "@/lib/navigation-session-client";

type HistoryState =
  | { status: "LOADING"; sessions: RemoteNavigationSession[] }
  | { status: "READY"; sessions: RemoteNavigationSession[] }
  | { status: "AUTH_REQUIRED" | "UNAVAILABLE"; sessions: [] };

const statusLabel: Record<RemoteNavigationSession["status"], string> = {
  READY: "待开始", ACTIVE: "进行中", PAUSED: "已暂停", REROUTE_REQUIRED: "需重算", COMPLETED: "已到达", CANCELLED: "已退出", EXPIRED: "已过期",
};

export function NavigationHistoryPanel() {
  const [state, setState] = useState<HistoryState>({ status: "LOADING", sessions: [] });
  useEffect(() => {
    let active = true;
    void readRemoteNavigationHistory(10).then((result) => {
      if (!active) return;
      setState(result.state === "READY" ? { status: "READY", sessions: result.sessions } : { status: result.state, sessions: [] });
    });
    return () => { active = false; };
  }, []);
  return <section className="mt-6 rounded-3xl border border-[#173f35]/12 bg-[#fffdf7] p-5" aria-labelledby="navigation-history-title">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e7eee8]"><ClockCounterClockwise size={21} /></span><div><h2 id="navigation-history-title" className="font-semibold text-[#173f35]">导航历史</h2><p className="mt-1 text-xs text-[#61716a]">只保存路线版本与粗粒度生命周期，不保存连续 GPS 轨迹。</p></div></div>
    {state.status === "LOADING" ? <p className="mt-4 flex items-center gap-2 text-sm text-[#61716a]"><SpinnerGap className="animate-spin motion-reduce:animate-none" />正在读取…</p> : null}
    {state.status === "AUTH_REQUIRED" ? <p className="mt-4 text-sm leading-6 text-[#61716a]">登录后可跨设备查看自己的导航记录。<Link href="/account" className="ml-1 font-semibold text-[#2369d8] underline">登录游客账号</Link></p> : null}
    {state.status === "UNAVAILABLE" ? <p className="mt-4 text-sm leading-6 text-[#61716a]">服务端导航历史尚未启用；当前前台导航仍可使用，但不会假装已经跨设备保存。</p> : null}
    {state.status === "READY" && state.sessions.length === 0 ? <p className="mt-4 text-sm text-[#61716a]">还没有已保存的正式导航记录。</p> : null}
    {state.status === "READY" && state.sessions.length > 0 ? <ol className="mt-4 grid gap-3">{state.sessions.map((session) => <li key={session.id} className="rounded-2xl border border-[#173f35]/10 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-[#173f35]">{session.originNodeId} → {session.destinationNodeId}</strong><span className="rounded-full bg-[#e7eee8] px-2.5 py-1 text-[11px] font-semibold text-[#52655c]">{statusLabel[session.status]}</span></div><p className="mt-2 text-xs leading-5 text-[#718078]">{session.optimization} · {Math.round(session.distanceMeters)} m · 约 {Math.ceil(session.estimatedMinutes)} 分钟 · {new Date(session.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p></li>)}</ol> : null}
  </section>;
}
