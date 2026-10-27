"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  Buildings,
  CarProfile,
  Check,
  Info,
  MapPin,
  PersonSimpleWalk,
  ShieldWarning,
  Signpost,
  Train,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ARRIVAL_MODES,
  ARRIVAL_PLANS,
  ARRIVAL_SCOPE,
  getArrivalEvidence,
  type ArrivalMode,
} from "@/lib/arrival-assistant";

const MODE_ICONS = { drive: CarProfile, rail: Train, local: PersonSimpleWalk } as const;

export function ArrivalAssistant() {
  const [mode, setMode] = useState<ArrivalMode>("drive");
  const [checked, setChecked] = useState<string[]>([]);
  const plan = ARRIVAL_PLANS[mode];
  const evidence = useMemo(() => getArrivalEvidence(plan), [plan]);

  function selectMode(next: ArrivalMode) {
    setMode(next);
    setChecked([]);
  }

  function toggleCheck(item: string) {
    setChecked((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  return (
    <div className="paper-noise min-h-[100dvh] pb-16">
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 md:px-8 md:pb-16 md:pt-18">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.22em] text-[#9b7a42]">Before you arrive</span>
            <h1 className="cultural-page-title mt-4 max-w-4xl text-[clamp(2.6rem,7vw,6.3rem)]">先找到正确范围，<span className="block text-[#9b7a42]">再开始这一程</span></h1>
          </div>
          <div className="rounded-[1.8rem] border border-[#a85245]/18 bg-[#fff7ed] p-5 md:p-6">
            <div className="flex items-center gap-2 font-semibold text-[#8b493e]"><ShieldWarning size={21} weight="duotone" />今天的状态仍需确认</div>
            <p className="mt-3 text-sm leading-7 text-[#6d625a]">这里不会虚构入口、班次、余位或开放时间。已核实的是节点与历史发布事实；当天运营信息请以交通部门、现场公示和工作人员答复为准。</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 md:px-8" aria-labelledby="arrival-mode-title">
        <div className="overflow-hidden rounded-[2rem] border border-[#173f35]/10 bg-[#fffaf0] shadow-[0_28px_80px_rgba(36,65,53,.12)]">
          <div className="border-b border-[#173f35]/10 p-5 md:p-8">
            <h2 id="arrival-mode-title" className="text-2xl font-semibold tracking-[-.035em] md:text-3xl">你准备怎么到？</h2>
            <div
              className="mt-5 grid gap-2 sm:grid-cols-3"
              role="tablist"
              aria-label="选择到达方式"
              onKeyDown={(event) => {
                const currentIndex = ARRIVAL_MODES.indexOf(mode);
                let nextIndex = currentIndex;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % ARRIVAL_MODES.length;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + ARRIVAL_MODES.length) % ARRIVAL_MODES.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = ARRIVAL_MODES.length - 1;
                else return;
                event.preventDefault();
                const nextMode = ARRIVAL_MODES[nextIndex];
                selectMode(nextMode);
                document.getElementById(`arrival-tab-${nextMode}`)?.focus();
              }}
            >
              {ARRIVAL_MODES.map((value) => {
                const Icon = MODE_ICONS[value];
                const active = value === mode;
                return <button key={value} id={`arrival-tab-${value}`} type="button" role="tab" aria-selected={active} aria-controls="arrival-plan" tabIndex={active ? 0 : -1} onClick={() => selectMode(value)} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2 ${active ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/12 bg-white/45 hover:bg-white"}`}><Icon size={22} weight="duotone" />{ARRIVAL_PLANS[value].label}</button>;
              })}
            </div>
          </div>

          <div id="arrival-plan" role="tabpanel" aria-labelledby={`arrival-tab-${mode}`} className="grid lg:grid-cols-[1.05fr_.95fr]">
            <article className="p-5 md:p-8 lg:border-r lg:border-[#173f35]/10">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e6eee6] px-3 py-1.5 text-xs font-semibold text-[#426151]">{plan.shortLabel}方案</span><span className="rounded-full border border-[#b88a43]/25 bg-[#f5ead9] px-3 py-1.5 text-xs font-semibold text-[#805f31]">非实时攻略</span></div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-.04em]">先确认，再前进</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#62736b]">{plan.summary}</p>
              <ol className="mt-7 space-y-5">
                {plan.steps.map((step, index) => <li key={step} className="grid grid-cols-[38px_1fr] gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#173f35] text-xs font-semibold text-white">{index + 1}</span><p className="pt-1 text-sm leading-7 text-[#425e54]">{step}</p></li>)}
              </ol>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/map" className="inline-flex items-center gap-2 rounded-full bg-[#173f35] px-5 py-3.5 text-sm font-medium text-white">打开详细旅游地图 <ArrowRight size={17} /></Link>
                <Link href="/plan" className="inline-flex items-center gap-2 rounded-full border border-[#173f35]/15 px-5 py-3.5 text-sm font-medium">继续规划候选行程 <Signpost size={18} weight="duotone" /></Link>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#7a817a]">地图只用于认识范围，不提供正式入口导航、转弯指引或安全保证。</p>
            </article>

            <aside className="bg-[#edf1e9] p-5 md:p-8" aria-labelledby="today-check-title">
              <div className="flex items-center justify-between gap-4"><h2 id="today-check-title" className="text-xl font-semibold">出发前 1 分钟检查</h2><span className="text-xs font-semibold text-[#465a50]" aria-live="polite">{checked.length}/{plan.confirmToday.length}</span></div>
              <p className="mt-2 text-xs leading-5 text-[#465a50]">勾选只保留在当前页面，不代表系统已经核验这些信息。</p>
              <div className="mt-5 space-y-2">
                {plan.confirmToday.map((item) => {
                  const active = checked.includes(item);
                  return <label key={item} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#173f35]/10 bg-[#fffaf0] p-4 text-sm"><input type="checkbox" checked={active} onChange={() => toggleCheck(item)} className="sr-only" /><span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${active ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/25"}`}>{active && <Check size={14} weight="bold" />}</span><span className={active ? "text-[#637269] line-through" : "text-[#294a40]"}>{item}</span></label>;
                })}
              </div>
              {checked.length === plan.confirmToday.length ? <div role="status" className="mt-4 rounded-2xl bg-[#dfeade] p-4 text-sm leading-6 text-[#3f624f]">你已逐项自行确认。进入现场后仍请服从最新标识、管制和工作人员指引。</div> : <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#b88a43]/20 bg-[#f7eddd] p-4 text-xs leading-6 text-[#755f3e]"><Info className="mt-0.5 shrink-0" size={17} weight="duotone" />未确认项不会被系统自动补全，也不会被 AI 猜测。</div>}
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-2 md:px-8 md:py-18" aria-labelledby="scope-title">
        <div className="md:col-span-2"><span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Know the scope</span><h2 id="scope-title" className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-5xl">“六祖镇”不等于一个可连续步行的景区</h2></div>
        {[ARRIVAL_SCOPE.core, ARRIVAL_SCOPE.extended].map((group, index) => <article key={group.title} className={`mt-4 rounded-[1.8rem] p-6 md:p-7 ${index === 0 ? "bg-[#173f35] text-[#fffaf0]" : "border border-[#173f35]/12 bg-white/45"}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] opacity-70">{index === 0 ? <Buildings size={20} weight="duotone" /> : <MapPin size={20} weight="duotone" />}{index === 0 ? "Core candidate" : "Extended candidates"}</div><h3 className="mt-4 text-2xl font-semibold">{group.title}</h3><ul className="mt-5 flex flex-wrap gap-2">{group.places.map((place) => <li key={place} className={`rounded-full px-3 py-2 text-xs ${index === 0 ? "bg-white/10" : "bg-[#e8eee7]"}`}>{place}</li>)}</ul><p className={`mt-5 text-sm leading-7 ${index === 0 ? "text-white/68" : "text-[#68776f]"}`}>{group.note}</p></article>)}
      </section>

      <section className="border-y border-[#173f35]/10 bg-[#e8ded0]/55 py-12 md:py-16" aria-labelledby="evidence-title">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"><div><span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Evidence, not promises</span><h2 id="evidence-title" className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-5xl">这个方案依据什么</h2></div><span className="w-fit rounded-full border border-[#173f35]/12 bg-[#fffaf0] px-3 py-2 text-xs font-semibold">来源核验：2026-08-14</span></div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {evidence.map((source) => <article key={source.id} className="rounded-[1.6rem] border border-[#173f35]/10 bg-[#fffaf0] p-5 md:p-6"><div className="flex items-center justify-between gap-4"><span className="font-mono text-xs font-semibold text-[#9b7a42]">[{source.id}]</span><span className="rounded-full bg-[#e7ede4] px-2.5 py-1 text-[10px] font-semibold">来源级别 {source.level}</span></div><h3 className="mt-4 text-lg font-semibold leading-7">{source.title}</h3><p className="mt-2 text-xs leading-5 text-[#6c7871]">{source.publisher} · 发布 {source.publishedAt}</p><p className="mt-4 text-sm leading-7 text-[#3f5c52]">{source.statement}</p><div className="mt-4 rounded-2xl bg-[#f4eadc] p-3 text-xs leading-6 text-[#705e48]"><strong>不能推出：</strong>{source.limitation}</div><a href={source.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline decoration-[#b88a43] underline-offset-4">查看官方原始页面 <ArrowSquareOut size={16} /></a></article>)}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-10 text-xs leading-6 text-[#6b786f] md:flex-row md:items-center md:justify-between md:px-8"><span>到达助手不保存你的选择，也不读取定位。</span><Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">查看数据与隐私说明</Link></footer>
    </div>
  );
}
