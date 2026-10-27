"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Clock, Compass, FloppyDisk, MapPin, Sparkle, Users, WarningCircle, X } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { getGuideSpotStory } from "@/lib/ai-guide/knowledge";
import { AI_GUIDE_FACT_TYPE_LABELS, AI_GUIDE_REVIEW_STATUS_LABELS, AI_GUIDE_SOURCE_STATUS_LABELS } from "@/lib/ai-guide/types";
import { createJourneyId, readJourneyData, writeJourneyData, type SavedRoute } from "@/lib/journey-store";
import { interpretPersonalRoutePrompt } from "@/lib/personal-route-intent";
import {
  PERSONAL_ROUTE_COMPANIONS,
  PERSONAL_ROUTE_DURATIONS,
  PERSONAL_ROUTE_INTERESTS,
  PERSONAL_ROUTE_PACES,
  buildPersonalRoute,
  buildRecommendedPersonalRoute,
  type PersonalRouteCompanion,
  type PersonalRouteDuration,
  type PersonalRouteInterest,
  type PersonalRoutePace,
  type PersonalRoutePlan,
} from "@/lib/personal-route-builder";
import { scenicSpots } from "@/lib/scenic-data";
import { AccessibleDialog } from "./AccessibleDialog";
import { CorrectionForm } from "./CorrectionForm";
import { HomeReferenceExperience } from "./HomeReferenceExperience";

export function HomeExperience() {
  const [selectedId, setSelectedId] = useState(scenicSpots[0].id);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [duration, setDuration] = useState<PersonalRouteDuration>("3小时");
  const [pace, setPace] = useState<PersonalRoutePace>("均衡");
  const [companion, setCompanion] = useState<PersonalRouteCompanion>("独自");
  const [interests, setInterests] = useState<PersonalRouteInterest[]>(["禅文化"]);
  const [generatedPlan, setGeneratedPlan] = useState<PersonalRoutePlan | null>(null);
  const [plannerPrompt, setPlannerPrompt] = useState("我只有3小时，希望轻松游玩，喜欢历史和摄影");
  const [promptMessage, setPromptMessage] = useState("输入一句话即可自动填写下方条件，也可以继续手动调整。");
  const [plannerState, setPlannerState] = useState<"idle" | "generating" | "ready">("idle");
  const [plannerError, setPlannerError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [mapRouteTitle, setMapRouteTitle] = useState<string | null>(null);
  const generationRequest = useRef(0);
  const reduceMotion = useReducedMotion();
  const selectedSpot = useMemo(() => scenicSpots.find((spot) => spot.id === selectedId) ?? scenicSpots[0], [selectedId]);
  const selectedStory = useMemo(() => getGuideSpotStory(selectedSpot.id), [selectedSpot.id]);

  function clearGeneratedPlan() {
    generationRequest.current += 1;
    setGeneratedPlan(null);
    setPlannerState("idle");
    setPlannerError("");
    setSaveState("idle");
    setSaveMessage("");
  }

  function toggleInterest(interest: PersonalRouteInterest) {
    setInterests((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]);
    clearGeneratedPlan();
  }

  function generatePersonalRoute() {
    const requestId = generationRequest.current + 1;
    generationRequest.current = requestId;
    setPlannerState("generating");
    setPlannerError("");
    setSaveState("idle");
    setSaveMessage("");
    const input = { duration, pace, companion, interests: [...interests] };

    window.setTimeout(() => {
      if (generationRequest.current !== requestId) return;
      const result = buildPersonalRoute(input);
      if (!result.ok) {
        setGeneratedPlan(null);
        setPlannerState("idle");
        setPlannerError(result.error);
        return;
      }
      setGeneratedPlan(result.plan);
      setPlannerState("ready");
    }, reduceMotion ? 0 : 140);
  }

  function generatePersonalRouteFromPrompt() {
    const intent = interpretPersonalRoutePrompt(plannerPrompt);
    generationRequest.current += 1;
    setSaveState("idle");
    setSaveMessage("");
    if (!intent.ok) {
      setGeneratedPlan(null);
      setPlannerState("idle");
      setPlannerError(intent.error);
      setPromptMessage("未生成路线，请修改需求后重试。");
      return;
    }
    setDuration(intent.input.duration);
    setPace(intent.input.pace);
    setCompanion(intent.input.companion);
    setInterests([...intent.input.interests]);
    const result = buildPersonalRoute(intent.input);
    if (!result.ok) {
      setGeneratedPlan(null);
      setPlannerState("idle");
      setPlannerError(result.error);
      setPromptMessage("已读懂你的偏好，但当前地点暂时不能组成完整的逐站路线。");
      return;
    }
    setGeneratedPlan(result.plan);
    setPlannerState("ready");
    setPlannerError("");
    setPromptMessage(intent.inferred.length
      ? `已解析并生成；${intent.inferred.join("；")}。你可以继续调整。`
      : "已完整识别时间、节奏、同行人与兴趣，并生成逐站路线。");
  }

  function openRecommendedRoute(id: string) {
    generationRequest.current += 1;
    const result = buildRecommendedPersonalRoute(id);
    setPlannerOpen(true);
    setSaveState("idle");
    setSaveMessage("");
    if (!result.ok) {
      setGeneratedPlan(null);
      setPlannerState("idle");
      setPlannerError(result.error);
      return;
    }
    setDuration(result.plan.input.duration);
    setPace(result.plan.input.pace);
    setCompanion(result.plan.input.companion);
    setInterests([...result.plan.input.interests]);
    setGeneratedPlan(result.plan);
    setPlannerState("ready");
    setPlannerError("");
  }

  function saveGeneratedRoute() {
    const plan = generatedPlan;
    if (!plan) {
      setSaveState("error");
      setSaveMessage("当前没有可保存的路线，请先完成生成。");
      return;
    }

    setSaveState("saving");
    setSaveMessage("正在保存到这台设备的“我的旅程”…");
    window.setTimeout(() => {
      const current = readJourneyData();
      if (current.error) {
        setSaveState("error");
        setSaveMessage(`未保存：${current.error}`);
        return;
      }
      const now = new Date().toISOString();
      const savedRoute: SavedRoute = {
        id: createJourneyId("route"),
        title: plan.title,
        plannedDate: "",
        duration: `${plan.totalDwellMinutes} 分钟建议停留（${plan.input.duration}可用）`,
        pace: `${plan.input.pace} · ${plan.input.companion}`,
        note: `${plan.summary} ${plan.boundaryNotes.join(" ")}`,
        status: plan.status,
        stops: plan.stops.map((stop) => ({
          id: stop.id,
          name: stop.name,
          verification: stop.verification,
          dwellMinutes: stop.dwellMinutes,
        })),
        createdAt: now,
        updatedAt: now,
      };
      const write = writeJourneyData({ ...current.data, routes: [savedRoute, ...current.data.routes], updatedAt: now });
      if (!write.ok) {
        setSaveState("error");
        setSaveMessage(`未保存：${write.error}`);
        return;
      }
      setSaveState("saved");
      setSaveMessage("已保存到这台设备，可在“我的旅程”回看；清除浏览器数据后将无法恢复。");
    }, reduceMotion ? 0 : 120);
  }

  function viewGeneratedRouteOnMap() {
    if (!generatedPlan || generatedPlan.stops.length < 2) {
      setPlannerError("路线至少需要两个可用地点，当前无法在地图中显示。");
      return;
    }
    setSelectedId(generatedPlan.stops[0].id);
    setMapRouteTitle(generatedPlan.title);
    setPlannerOpen(false);
    window.setTimeout(() => document.querySelector("#map")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }), 0);
  }

  return (
    <main className="min-h-[100dvh] overflow-x-clip">
      <HomeReferenceExperience
        selectedSpotId={selectedId}
        mapRouteTitle={mapRouteTitle}
        onSpotSelect={setSelectedId}
        onOpenPlanner={() => setPlannerOpen(true)}
        onOpenRecommendedRoute={openRecommendedRoute}
        onOpenStory={() => setStoryOpen(true)}
      />

      <AnimatePresence>
        {plannerOpen && (
          <AccessibleDialog onClose={() => setPlannerOpen(false)} labelledBy="planner-title" describedBy="planner-description" className="mt-auto mb-0 w-full max-w-3xl rounded-t-[2rem] md:m-auto md:rounded-[2rem]">
            <motion.section initial={reduceMotion ? undefined : { opacity: 0, y: 40, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="p-5 md:p-8">
              <div className="flex items-start justify-between gap-5"><div><span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Route maker</span><h2 id="planner-title" className="mt-2 text-3xl font-semibold tracking-[-.04em] md:text-4xl">今天想怎么逛？</h2><p id="planner-description" className="mt-2 max-w-xl text-sm leading-6 text-[#65766f]">输入或选择时间、节奏、同行人与兴趣，在本机生成可保存、回看的候选行程；它尚不是正式导航。</p></div><button type="button" autoFocus onClick={() => setPlannerOpen(false)} aria-label="关闭路线生成器" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#173f35]/12 outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2"><X size={20} /></button></div>

              <div className="mt-7 rounded-2xl border border-[#173f35]/12 bg-[#f5f7f3] p-4">
                <label htmlFor="personal-route-prompt" className="flex items-center gap-2 text-sm font-semibold"><Sparkle size={18} weight="duotone" />一句话规划</label>
                <textarea id="personal-route-prompt" value={plannerPrompt} onChange={(event) => { setPlannerPrompt(event.target.value); clearGeneratedPlan(); setPromptMessage("需求已修改，点击下方按钮重新解析。"); }} maxLength={300} rows={3} className="mt-2 w-full rounded-xl border border-[#173f35]/16 bg-white p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2" placeholder="例如：我只有3小时，希望轻松游玩，喜欢摄影和自然，带着孩子" />
                <button type="button" onClick={generatePersonalRouteFromPrompt} disabled={plannerState === "generating" || saveState === "saving"} className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#b88a43] px-4 text-sm font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-55"><Sparkle size={18} weight="fill" />本机解析并生成候选行程</button>
                <p role="status" aria-live="polite" className="mt-2 text-xs leading-5 text-[#65766f]">{promptMessage}</p>
              </div>

              <div className="mt-7 grid gap-7 md:grid-cols-2">
                <fieldset disabled={plannerState === "generating" || saveState === "saving"}><legend className="flex items-center gap-2 text-sm font-semibold"><Clock size={18} weight="duotone" />可用时间</legend><div className="mt-3 grid grid-cols-3 gap-2">{PERSONAL_ROUTE_DURATIONS.map((value) => <button type="button" key={value} onClick={() => { setDuration(value); clearGeneratedPlan(); }} aria-pressed={duration === value} className={`rounded-xl border px-3 py-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2 ${duration === value ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/12 hover:bg-white"}`}>{value}</button>)}</div></fieldset>
                <fieldset disabled={plannerState === "generating" || saveState === "saving"}><legend className="flex items-center gap-2 text-sm font-semibold"><Compass size={18} weight="duotone" />游览节奏</legend><div className="mt-3 grid grid-cols-3 gap-2">{PERSONAL_ROUTE_PACES.map((value) => <button type="button" key={value} onClick={() => { setPace(value); clearGeneratedPlan(); }} aria-pressed={pace === value} className={`rounded-xl border px-3 py-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2 ${pace === value ? "border-[#b88a43] bg-[#efe4d3]" : "border-[#173f35]/12 hover:bg-white"}`}>{value}</button>)}</div></fieldset>
                <fieldset disabled={plannerState === "generating" || saveState === "saving"}><legend className="flex items-center gap-2 text-sm font-semibold"><Users size={18} weight="duotone" />同行人</legend><div className="mt-3 grid grid-cols-2 gap-2">{PERSONAL_ROUTE_COMPANIONS.map((value) => <button type="button" key={value} onClick={() => { setCompanion(value); clearGeneratedPlan(); }} aria-pressed={companion === value} className={`rounded-xl border px-3 py-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2 ${companion === value ? "border-[#173f35] bg-[#e4ebe4]" : "border-[#173f35]/12 hover:bg-white"}`}>{value}</button>)}</div></fieldset>
                <fieldset disabled={plannerState === "generating" || saveState === "saving"} aria-describedby="interest-help"><legend className="flex items-center gap-2 text-sm font-semibold"><Sparkle size={18} weight="duotone" />兴趣（可多选）</legend><div className="mt-3 grid grid-cols-2 gap-2">{PERSONAL_ROUTE_INTERESTS.map((value) => <button type="button" key={value} onClick={() => toggleInterest(value)} aria-pressed={interests.includes(value)} className={`rounded-xl border px-3 py-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2 ${interests.includes(value) ? "border-[#b88a43] bg-[#efe4d3]" : "border-[#173f35]/12 hover:bg-white"}`}>{value}</button>)}</div><p id="interest-help" className="mt-2 text-xs text-[#78857f]">至少选择一项；清空后会明确停止生成。</p></fieldset>
              </div>

              <div className="mt-7 rounded-2xl bg-[#e7eee8] p-4 text-sm leading-6 text-[#536b61]">路线只组合研究候选地点，未经管理方与现场核验。停留时间是软件示例，不包含路途和开放限制；藏佛坑不进入自动行程。</div>
              <button type="button" onClick={generatePersonalRoute} disabled={plannerState === "generating" || saveState === "saving"} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-4 font-medium text-white outline-none transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-65 focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2"><Sparkle size={18} weight="duotone" />{plannerState === "generating" ? "正在规划地点…" : `生成 ${duration} · ${pace} · ${companion}路线`}</button>

              {plannerError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-[#a3483b]/20 bg-[#fff3e9] p-4 text-sm leading-6 text-[#7b493f]"><WarningCircle className="mt-0.5 shrink-0" size={18} weight="fill" />{plannerError}</div>}

              <div className="mt-7" aria-live="polite" aria-busy={plannerState === "generating"}>
                {plannerState === "generating" ? <div className="grid gap-3" role="status"><span className="sr-only">正在生成个性路线</span>{[0, 1, 2].map((item) => <div key={item} className="h-17 animate-pulse rounded-2xl bg-[#173f35]/7 motion-reduce:animate-none" />)}</div> : generatedPlan ? <div>
                  <div className="flex flex-col gap-3 rounded-[1.6rem] border border-[#173f35]/10 bg-white/55 p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div><div className="flex items-center gap-2 text-sm text-[#53705f]"><Check size={18} weight="bold" />候选行程已生成 <span className="rounded-full bg-[#f4eadb] px-2 py-1 text-xs">DEMO ONLY</span></div><h3 className="mt-2 text-2xl font-semibold tracking-[-.03em]">{generatedPlan.title}</h3><p className="mt-2 text-sm leading-6 text-[#65766f]">{generatedPlan.summary}</p></div>
                    <span className="w-fit shrink-0 rounded-full border border-[#b88a43]/25 bg-[#f3e9d8] px-3 py-1.5 text-xs font-semibold text-[#8a6432]">行前规划</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-[#edf1e9] p-3"><dt className="text-[10px] text-[#748078]">途经地点</dt><dd className="mt-1 font-semibold">{generatedPlan.stops.length} 个</dd></div><div className="rounded-2xl bg-[#edf1e9] p-3"><dt className="text-[10px] text-[#748078]">总停留</dt><dd className="mt-1 font-semibold">{generatedPlan.totalDwellMinutes} 分钟</dd></div><div className="rounded-2xl bg-[#edf1e9] p-3"><dt className="text-[10px] text-[#748078]">可用时间</dt><dd className="mt-1 font-semibold">{generatedPlan.availableMinutes} 分钟</dd></div></dl>
                  <ol className="mt-5 divide-y divide-[#173f35]/10 border-y border-[#173f35]/10">
                    {generatedPlan.stops.map((stop, index) => <li key={stop.id} className="grid grid-cols-[34px_1fr] gap-3 py-5 sm:grid-cols-[34px_1fr_auto]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e8dfd0] text-xs font-semibold">{index + 1}</span><span><span className="flex flex-wrap items-center gap-2"><strong>{stop.name}</strong><span className="rounded-full bg-[#edf1e9] px-2 py-0.5 text-[10px] text-[#5f7169]">{stop.verification}</span></span><span className="mt-1 block text-xs leading-5 text-[#728078]">{stop.reason}</span></span><span className="col-start-2 text-xs font-semibold text-[#9b7a42] sm:col-start-auto">建议停留 {stop.dwellMinutes} 分钟</span></li>)}
                  </ol>
                  <div className="mt-4 rounded-2xl border border-[#b88a43]/20 bg-[#f6ede0] p-4"><strong className="flex items-center gap-2 text-sm"><WarningCircle size={18} weight="duotone" />使用边界</strong><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f6f65]">{generatedPlan.boundaryNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={viewGeneratedRouteOnMap} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3.5 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2"><MapPin size={17} />在地图中查看</button>
                    <button type="button" onClick={saveGeneratedRoute} disabled={saveState === "saving" || saveState === "saved"} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#173f35]/15 px-5 py-3.5 text-sm font-medium outline-none disabled:cursor-default disabled:opacity-65 focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2"><FloppyDisk size={17} />{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存" : "保存到我的旅程"}</button>
                    <a href={generatedPlan.legacyGuideHref} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#b88a43]/30 bg-[#f3e9d8] px-5 py-3.5 text-center text-sm font-medium text-[#714f28] outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2">查看分站导览（演示） <ArrowRight size={16} /></a>
                    <button type="button" onClick={clearGeneratedPlan} disabled={saveState === "saving"} className="rounded-full border border-[#173f35]/15 px-5 py-3.5 text-sm font-medium outline-none disabled:cursor-wait disabled:opacity-65 focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2">重新设置</button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#7a817a]">可选择在地图应用中查看单个候选地点；景区内部路网尚未核验，不能据此进行安全步行导航。</p>
                  {saveMessage && <div role={saveState === "error" ? "alert" : "status"} className={`mt-4 rounded-2xl p-4 text-sm leading-6 ${saveState === "error" ? "border border-[#a3483b]/20 bg-[#fff3e9] text-[#7b493f]" : "bg-[#e5eee5] text-[#466554]"}`}>{saveMessage}{saveState === "saved" && <a href="/journey" className="ml-2 font-semibold underline underline-offset-4">去我的旅程回看</a>}</div>}
                </div> : <div className="rounded-2xl border border-dashed border-[#173f35]/18 px-5 py-7 text-center text-sm leading-6 text-[#728078]">选择偏好后生成路线；结果会在这里解释选点原因、停留时长和核验边界。</div>}
              </div>
            </motion.section>
          </AccessibleDialog>
        )}

        {storyOpen && (
          <AccessibleDialog onClose={() => setStoryOpen(false)} labelledBy="story-title" className="mt-auto mb-0 w-full max-w-xl rounded-t-[2rem] md:m-auto md:rounded-[2rem]">
            <motion.article initial={reduceMotion ? undefined : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-9">
              <div className="flex items-start justify-between"><span className="rounded-full bg-[#efe4d3] px-3 py-1.5 text-xs text-[#7a6542]">{selectedSpot.verification}</span><button type="button" onClick={() => setStoryOpen(false)} aria-label="关闭景点故事" className="grid h-12 w-12 place-items-center rounded-full border border-[#173f35]/12"><X size={20} /></button></div>
              <h2 id="story-title" className="mt-5 text-4xl font-semibold tracking-[-.045em]">{selectedSpot.name}</h2>
              {selectedStory ? <>
                <div className="mt-4 flex flex-wrap gap-2" aria-label="景点故事事实类型">{selectedStory.factTypes.map((factType) => <span key={factType} className="rounded-full bg-[#e5eadf] px-2.5 py-1 text-xs font-medium text-[#3f624f]">{AI_GUIDE_FACT_TYPE_LABELS[factType]}</span>)}</div>
                <p className="mt-5 text-base leading-8 text-[#5f7169]">{selectedStory.body}</p>
                <div className="mt-5 rounded-2xl border border-[#173f35]/10 bg-white/55 p-4" aria-label="景点故事审核与来源状态">
                  <strong className="text-xs uppercase tracking-[.14em] text-[#7a684b]">审核与来源状态</strong>
                  <ul className="mt-3 space-y-3">{selectedStory.sources.map((source) => <li key={source.id} className="text-xs leading-5 text-[#5f7169]"><strong className="block text-[#294c41]">[{source.id}] {source.title}</strong><span className="block">{source.publisher} · 核验 {source.checkedAt}</span><span className="block">{AI_GUIDE_FACT_TYPE_LABELS[source.factType]} · {AI_GUIDE_SOURCE_STATUS_LABELS[source.sourceStatus]}</span><span className="block text-[#7c6e58]">{AI_GUIDE_REVIEW_STATUS_LABELS[source.reviewStatus]}</span>{source.url && <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex underline underline-offset-4">查看原始来源</a>}</li>)}</ul>
                </div>
              </> : <div role="alert" className="mt-5 rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed] p-4 text-sm leading-6 text-[#75524b]">故事的事实类型或来源状态未通过校验，已拒绝展示。</div>}
              <div className="mt-6 rounded-2xl border border-[#b88a43]/20 bg-[#f4eadb] p-4"><strong className="text-sm">小荔提醒</strong><p className="mt-2 text-sm leading-6 text-[#637269]">宗教与文保空间默认保持安静。拍摄、语音播放和活动规则以现场最新提示为准。</p></div>
              <CorrectionForm subject={selectedSpot.name} />
              <button type="button" onClick={() => setStoryOpen(false)} className="mt-6 w-full rounded-full bg-[#173f35] px-5 py-3.5 text-sm font-medium text-white">知道了，继续探索</button>
            </motion.article>
          </AccessibleDialog>
        )}
      </AnimatePresence>
    </main>
  );
}
