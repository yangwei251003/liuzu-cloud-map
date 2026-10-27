"use client";

import { CalendarDots, FlagBanner, Plus, Sparkle, X } from "@phosphor-icons/react";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import {
  createCommunityProgram,
  getCommunityProgramsServerSnapshot,
  getCommunityProgramsSnapshot,
  subscribeCommunityPrograms,
  type CommunityProgramKind,
} from "@/lib/community-program-store";

const LABELS: Record<CommunityProgramKind, string> = {
  TOPIC: "旅行话题",
  CHALLENGE: "游玩挑战",
  OFFICIAL_EVENT: "官方活动",
};

export function CommunityPrograms({ placeId }: { placeId: string }) {
  const programs = useSyncExternalStore(subscribeCommunityPrograms, getCommunityProgramsSnapshot, getCommunityProgramsServerSnapshot);
  const [kind, setKind] = useState<"TOPIC" | "CHALLENGE">("TOPIC");
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const visible = programs.filter((item) => item.placeId === "all" || item.placeId === placeId).slice(0, 5);

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = createCommunityProgram({ kind, placeId, title, summary, creatorLabel: "社区游客" });
    if (!result.ok) { setNotice(result.error); return; }
    setTitle(""); setSummary(""); setNotice("已发布到当前地点社区。"); setFormOpen(false);
  }

  return <section className="mb-5 overflow-hidden rounded-3xl border border-[#173f35]/12 bg-white/65 p-4 shadow-[0_18px_45px_rgba(23,63,53,.08)]" aria-labelledby="community-program-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><span className="text-xs font-semibold tracking-[.14em] text-[#85652d]">一起参与</span><h2 id="community-program-title" className="mt-1 text-xl font-semibold text-[#173f35]">话题、挑战与主题活动</h2></div>
      <button type="button" onClick={() => setFormOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#173f35] px-4 text-sm font-semibold text-white"><Plus size={17} />发起互动</button>
    </div>
    {formOpen ? <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl bg-[#eef3ed] p-4">
      <div className="flex items-center justify-between"><strong className="text-sm text-[#173f35]">发起新的社区互动</strong><button type="button" onClick={() => setFormOpen(false)} aria-label="关闭发起表单"><X size={18} /></button></div>
      <div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={kind === "TOPIC"} onClick={() => setKind("TOPIC")} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-white text-sm aria-pressed:bg-[#173f35] aria-pressed:text-white">旅行话题</button><button type="button" aria-pressed={kind === "CHALLENGE"} onClick={() => setKind("CHALLENGE")} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-white text-sm aria-pressed:bg-[#173f35] aria-pressed:text-white">游玩挑战</button></div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={48} placeholder="给互动起一个吸引人的标题" className="min-h-12 rounded-xl border border-[#173f35]/15 bg-white px-3 text-sm" />
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={180} placeholder="告诉大家如何参与" className="min-h-24 rounded-xl border border-[#173f35]/15 bg-white p-3 text-sm" />
      {notice ? <p role="status" className="text-xs text-[#76551f]">{notice}</p> : null}
      <button type="submit" className="min-h-11 rounded-xl bg-[#b88a43] font-semibold text-white">立即发布</button>
    </form> : null}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {visible.map((item) => <article key={item.id} className="rounded-2xl border border-[#173f35]/10 bg-[#fffdf8] p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#85652d]">{item.kind === "OFFICIAL_EVENT" ? <CalendarDots size={16} /> : item.kind === "CHALLENGE" ? <FlagBanner size={16} /> : <Sparkle size={16} />}{LABELS[item.kind]}</span>
        <h3 className="mt-2 text-base font-semibold text-[#173f35]">{item.title}</h3><p className="mt-1 text-sm leading-6 text-[#5e6f67]">{item.summary}</p><small className="mt-3 block text-[#7b857f]">{item.creatorLabel}</small>
      </article>)}
    </div>
  </section>;
}

export function AdminCommunityEventPublisher() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = createCommunityProgram({ kind: "OFFICIAL_EVENT", placeId: "all", title, summary, creatorLabel: "六祖云游运营" });
    setNotice(result.ok ? "活动已发布到社区首页。" : result.error);
    if (result.ok) { setTitle(""); setSummary(""); }
  }
  return <section className="mx-auto mt-8 w-full max-w-4xl rounded-3xl border border-[#173f35]/14 bg-white p-6 shadow-sm" aria-labelledby="admin-community-event-title"><h2 id="admin-community-event-title" className="text-xl font-semibold text-[#173f35]">发布社区主题活动</h2><p className="mt-2 text-sm text-[#5e6f67]">活动发布后会展示在各地点社区的“话题、挑战与主题活动”区域。</p><form onSubmit={submit} className="mt-4 grid gap-3"><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={48} placeholder="活动标题" className="min-h-12 rounded-xl border border-[#173f35]/15 px-3" /><textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={180} placeholder="活动介绍与参与方式" className="min-h-24 rounded-xl border border-[#173f35]/15 p-3" />{notice ? <p role="status" className="text-sm text-[#76551f]">{notice}</p> : null}<button type="submit" className="min-h-12 rounded-xl bg-[#173f35] font-semibold text-white">发布官方活动</button></form></section>;
}
