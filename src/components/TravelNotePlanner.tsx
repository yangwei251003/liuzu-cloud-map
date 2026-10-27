"use client";

import { ArrowDown, ArrowRight, ArrowUp, Check, MapPin, Sparkle, Trash, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionHeader } from "./PageShell";
import { scenicSpots, type ScenicSpot } from "@/lib/scenic-data";
import { analyzeItineraryText, extractItineraryCandidates } from "@/lib/itinerary-extract/local";
import type { ExtractedItineraryStop, ItineraryAmbiguity, ItineraryExtraction, UnresolvedIssue } from "@/lib/itinerary-extract/types";
import { createJourneyId, readJourneyData, writeJourneyData, type SavedRoute } from "@/lib/journey-store";
import {
  createRoutePlanSnapshot,
  saveRoutePlan,
  type RoutePlanAmbiguityResolution,
  type RoutePlanStop,
} from "@/lib/route-plan-store";

const sample = "上午先去国恩寺，想安静地了解六祖文化，大约停留一小时。之后去六祖惠能故居看看，午后到龙山温泉休息。我们带着长辈，希望少走路。";

type PlannerStop = ScenicSpot & Pick<
  ExtractedItineraryStop,
  "evidence" | "start" | "end" | "dwellMinutes" | "confidence" | "eligibleForRoute" | "reviewNote"
> & { ambiguityId?: string };

type AmbiguityDraft = {
  decision: "" | "SELECTED" | "EXCLUDED";
  selectedCandidateId: string;
  reason: string;
};

type IssueDraft = {
  method: "" | "VALUE_PROVIDED" | "EXPLICITLY_IGNORED";
  value: string;
  reason: string;
};

const emptyAmbiguityDraft: AmbiguityDraft = { decision: "", selectedCandidateId: "", reason: "" };
const emptyIssueDraft: IssueDraft = { method: "", value: "", reason: "" };

const issueLabels: Record<UnresolvedIssue["type"], string> = {
  DWELL_TIME: "停留时长",
  TIME_WINDOW: "时间窗口",
  ACTION_CONSTRAINT: "行动约束",
  UNKNOWN_FRAGMENT: "未知片段",
};

function localExtraction(text: string): ItineraryExtraction {
  const candidates = extractItineraryCandidates(text);
  const analysis = analyzeItineraryText(text, candidates.stops, candidates.ambiguities);
  return {
    requestId: `local-${Date.now()}`,
    mode: "LOCAL_RULES",
    status: "REVIEW_REQUIRED",
    stops: candidates.stops,
    ambiguities: candidates.ambiguities,
    ...analysis,
    warnings: [
      "已切换为本地规则提取，所有结果仍需游客校对。",
      "道路、入口、开放状态和安全信息不由文本提取结果决定。",
    ],
  };
}

function reviewIssues(extraction: ItineraryExtraction | null, stops: PlannerStop[]): UnresolvedIssue[] {
  if (!extraction) return [];
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const retained = extraction.unresolved.filter((issue) => issue.type !== "DWELL_TIME" || !issue.stopId || stopById.has(issue.stopId));
  const existingDwellIds = new Set(retained.flatMap((issue) => issue.type === "DWELL_TIME" && issue.stopId ? [issue.stopId] : []));
  const fuzzyDwell = stops.flatMap((stop): UnresolvedIssue[] => {
    if (!stop.ambiguityId || stop.dwellMinutes !== null || existingDwellIds.has(stop.id)) return [];
    return [{
      id: `unresolved-dwell_time-${stop.start}-${stop.id}`,
      type: "DWELL_TIME",
      evidence: stop.evidence,
      message: `${stop.name}来自消歧选择，尚未填写停留时长。`,
      stopId: stop.id,
      start: stop.start,
      end: stop.end,
      blocking: true,
      status: "UNRESOLVED",
      resolution: null,
    }];
  });
  return [...retained, ...fuzzyDwell];
}

function issueIsClosed(issue: UnresolvedIssue, stops: PlannerStop[], draft: IssueDraft | undefined): boolean {
  if (issue.status !== "UNRESOLVED") return true;
  if (issue.type === "DWELL_TIME" && issue.stopId) {
    const dwell = stops.find((stop) => stop.id === issue.stopId)?.dwellMinutes;
    if (dwell !== null && dwell !== undefined && Number.isInteger(dwell) && dwell >= 10 && dwell <= 240) return true;
  }
  if (draft?.method === "VALUE_PROVIDED") return issue.type !== "DWELL_TIME" && Boolean(draft.value.trim() && draft.reason.trim());
  return draft?.method === "EXPLICITLY_IGNORED" && Boolean(draft.reason.trim());
}

function materializeIssues(issues: UnresolvedIssue[], stops: PlannerStop[], drafts: Record<string, IssueDraft>, resolvedAt: string): UnresolvedIssue[] {
  return issues.map((issue) => {
    const dwell = issue.stopId ? stops.find((stop) => stop.id === issue.stopId)?.dwellMinutes : null;
    if (issue.type === "DWELL_TIME" && dwell !== null && dwell !== undefined && Number.isInteger(dwell) && dwell >= 10 && dwell <= 240) {
      return {
        ...issue,
        status: "RESOLVED",
        resolution: {
          method: "VALUE_PROVIDED",
          value: `${dwell} 分钟`,
          reason: "游客在候选站校对中明确填写停留时长。",
          resolvedAt,
        },
      };
    }
    const draft = drafts[issue.id];
    if (draft?.method === "VALUE_PROVIDED" && issue.type !== "DWELL_TIME" && draft.value.trim() && draft.reason.trim()) {
      return {
        ...issue,
        status: "RESOLVED",
        resolution: {
          method: "VALUE_PROVIDED",
          value: draft.value.trim(),
          reason: draft.reason.trim(),
          resolvedAt,
        },
      };
    }
    if (draft?.method === "EXPLICITLY_IGNORED" && draft.reason.trim()) {
      return {
        ...issue,
        status: "IGNORED",
        resolution: {
          method: "EXPLICITLY_IGNORED",
          value: "",
          reason: draft.reason.trim(),
          resolvedAt,
        },
      };
    }
    return { ...issue, status: "UNRESOLVED", resolution: null };
  });
}

function buildAmbiguityResolutions(
  ambiguities: ItineraryAmbiguity[],
  drafts: Record<string, AmbiguityDraft>,
  stops: PlannerStop[],
  resolvedAt: string,
): RoutePlanAmbiguityResolution[] {
  return ambiguities.flatMap<RoutePlanAmbiguityResolution>((ambiguity) => {
    const draft = drafts[ambiguity.id];
    if (!draft?.reason.trim()) return [];
    if (draft.decision === "EXCLUDED") {
      return [{
        ambiguityId: ambiguity.id,
        evidence: ambiguity.evidence,
        start: ambiguity.start,
        end: ambiguity.end,
        decision: "EXCLUDED",
        selectedCandidateId: null,
        reason: draft.reason.trim(),
        resolvedAt,
      }];
    }
    if (
      draft.decision === "SELECTED"
      && ambiguity.candidates.some((candidate) => candidate.id === draft.selectedCandidateId)
      && stops.some((stop) => stop.id === draft.selectedCandidateId)
    ) {
      return [{
        ambiguityId: ambiguity.id,
        evidence: ambiguity.evidence,
        start: ambiguity.start,
        end: ambiguity.end,
        decision: "SELECTED",
        selectedCandidateId: draft.selectedCandidateId,
        reason: draft.reason.trim(),
        resolvedAt,
      }];
    }
    return [];
  });
}

export function TravelNotePlanner() {
  const [text, setText] = useState(sample);
  const [stops, setStops] = useState<PlannerStop[]>([]);
  const [extraction, setExtraction] = useState<ItineraryExtraction | null>(null);
  const [stage, setStage] = useState<"INPUT" | "REVIEW" | "SAVED">("INPUT");
  const [transport, setTransport] = useState("自驾/网约车");
  const [notice, setNotice] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [remoteConsent, setRemoteConsent] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [ambiguityDrafts, setAmbiguityDrafts] = useState<Record<string, AmbiguityDraft>>({});
  const [issueDrafts, setIssueDrafts] = useState<Record<string, IssueDraft>>({});
  const executableStops = useMemo(() => stops.filter((stop) => stop.eligibleForRoute), [stops]);
  const issues = useMemo(() => reviewIssues(extraction, stops), [extraction, stops]);
  const unresolvedIssueCount = useMemo(
    () => issues.filter((issue) => !issueIsClosed(issue, stops, issueDrafts[issue.id])).length,
    [issueDrafts, issues, stops],
  );
  const resolvedAmbiguityCount = useMemo(
    () => extraction ? buildAmbiguityResolutions(extraction.ambiguities, ambiguityDrafts, stops, "2026-01-01T00:00:00.000Z").length : 0,
    [ambiguityDrafts, extraction, stops],
  );
  const unresolvedAmbiguityCount = (extraction?.ambiguities.length ?? 0) - resolvedAmbiguityCount;
  const blockingCount = unresolvedIssueCount + unresolvedAmbiguityCount;
  const guideHref = savedPlanId ? `/guide?demo=1&planId=${encodeURIComponent(savedPlanId)}` : "/guide";

  function markDirty() {
    setSavedPlanId(null);
    setStage("REVIEW");
  }

  function mapStops(items: ItineraryExtraction["stops"]): PlannerStop[] {
    return items.flatMap((item) => {
      const spot = scenicSpots.find((candidate) => candidate.id === item.id);
      return spot ? [{ ...spot, ...item }] : [];
    });
  }

  function applyExtraction(payload: ItineraryExtraction, message: string) {
    const matches = mapStops(payload.stops);
    setExtraction(payload);
    setStops(matches);
    setAmbiguityDrafts({});
    setIssueDrafts({});
    setSavedPlanId(null);
    setStage("REVIEW");
    const reviewCount = payload.ambiguities.length + payload.unresolved.length;
    setNotice(matches.length || payload.ambiguities.length
      ? `${message}已识别 ${matches.length} 个明确地点，并保留 ${payload.ambiguities.length} 组多候选、${reviewCount} 项待处理内容。`
      : `${message}没有识别到已登记地点；未知片段仍保留在待处理清单中。`);
  }

  async function extract() {
    setExtracting(true);
    setNotice("");
    try {
      const response = await fetch("/api/itinerary/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, allowRemote: remoteConsent }),
      });
      const payload = await response.json() as ItineraryExtraction | { error?: { message?: string } };
      if (
        !response.ok ||
        !("stops" in payload) ||
        !Array.isArray(payload.ambiguities) ||
        !Array.isArray(payload.unrecognizedFragments) ||
        !Array.isArray(payload.unresolved)
      ) throw new Error("error" in payload ? payload.error?.message : "提取服务暂时不可用。");
      applyExtraction(payload, payload.mode === "MODEL_GROUNDED" ? "已用受限 AI 完成候选提取。" : "已用本地规则完成候选提取。");
    } catch {
      applyExtraction(localExtraction(text), "网络不可用，已在本机安全降级。");
    } finally {
      setExtracting(false);
    }
  }

  function resetForText(value: string) {
    setText(value);
    setStops([]);
    setExtraction(null);
    setAmbiguityDrafts({});
    setIssueDrafts({});
    setSavedPlanId(null);
    setRemoteConsent(false);
    setStage("INPUT");
    setNotice(value ? "文本已修改，请重新提取行程候选。" : "已清空输入。 ");
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    setStops(next);
    markDirty();
  }

  function setDwell(index: number, value: string) {
    const next = [...stops];
    next[index] = { ...next[index], dwellMinutes: value === "" ? null : Number(value) };
    setStops(next);
    markDirty();
  }

  function chooseAmbiguity(ambiguity: ItineraryAmbiguity, value: string) {
    const decision = value === "EXCLUDED" ? "EXCLUDED" : value ? "SELECTED" : "";
    setAmbiguityDrafts((current) => ({
      ...current,
      [ambiguity.id]: {
        ...(current[ambiguity.id] ?? emptyAmbiguityDraft),
        decision,
        selectedCandidateId: decision === "SELECTED" ? value : "",
      },
    }));
    setStops((current) => {
      const withoutPriorSelection = current.filter((stop) => stop.ambiguityId !== ambiguity.id);
      if (decision !== "SELECTED") return withoutPriorSelection;
      if (withoutPriorSelection.some((stop) => stop.id === value)) return withoutPriorSelection;
      const candidate = ambiguity.candidates.find((item) => item.id === value);
      const spot = scenicSpots.find((item) => item.id === value);
      if (!candidate || !spot) return withoutPriorSelection;
      return [...withoutPriorSelection, {
        ...spot,
        evidence: ambiguity.evidence,
        start: ambiguity.start,
        end: ambiguity.end,
        dwellMinutes: null,
        confidence: "FUZZY",
        eligibleForRoute: candidate.eligibleForRoute,
        reviewNote: candidate.reviewNote,
        ambiguityId: ambiguity.id,
      }];
    });
    markDirty();
  }

  function removeStop(stop: PlannerStop) {
    setStops((current) => current.filter((item) => item !== stop));
    setAmbiguityDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [
      id,
      draft.selectedCandidateId === stop.id ? emptyAmbiguityDraft : draft,
    ])));
    markDirty();
  }

  function updateIssueDraft(issueId: string, changes: Partial<IssueDraft>) {
    setIssueDrafts((current) => ({
      ...current,
      [issueId]: { ...(current[issueId] ?? emptyIssueDraft), ...changes },
    }));
    markDirty();
  }

  function routePlanStops(): RoutePlanStop[] {
    return stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      verification: stop.verification,
      evidence: stop.evidence,
      start: stop.start,
      end: stop.end,
      dwellMinutes: stop.dwellMinutes,
      confidence: stop.confidence,
      eligibleForRoute: stop.eligibleForRoute,
      includedInDemo: stop.eligibleForRoute,
      reviewNote: stop.reviewNote,
    }));
  }

  function saveDraft() {
    if (!extraction || !executableStops.length) {
      setNotice("暂时没有可加入路线的地点；未识别或受限地点不会被自动加入。");
      return;
    }
    if (stops.some((stop) => stop.dwellMinutes !== null && (!Number.isInteger(stop.dwellMinutes) || stop.dwellMinutes < 10 || stop.dwellMinutes > 240))) {
      setNotice("停留时间只能填写 10 至 240 分钟的整数；不确定时可明确忽略并填写原因。");
      return;
    }
    if (blockingCount > 0) {
      setNotice(`仍有 ${blockingCount} 项需要明确选择、填写或说明忽略原因，暂不能生成可演示快照。`);
      return;
    }

    const now = new Date().toISOString();
    const resolvedIssues = materializeIssues(issues, stops, issueDrafts, now);
    const ambiguityResolutions = buildAmbiguityResolutions(extraction.ambiguities, ambiguityDrafts, stops, now);
    const snapshotExtraction: ItineraryExtraction = {
      ...extraction,
      stops: stops.map(({ id, name, evidence, start, end, dwellMinutes, confidence, eligibleForRoute, reviewNote }) => ({ id, name, evidence, start, end, dwellMinutes, confidence, eligibleForRoute, reviewNote })),
      unresolved: resolvedIssues,
    };
    const snapshot = createRoutePlanSnapshot({
      title: "从游记生成的六祖候选行程",
      transport,
      sourceText: text,
      extraction: snapshotExtraction,
      stops: routePlanStops(),
      ambiguityResolutions,
    }, now);
    if (!snapshot.ok) {
      setNotice(snapshot.error);
      return;
    }
    if (!snapshot.plan.validation.demoEligible) {
      setNotice("快照仍未满足本机演示条件，已拒绝保存；请重新检查所有待处理项。");
      return;
    }
    const saved = saveRoutePlan(snapshot.plan);
    if (!saved.ok) {
      setNotice(saved.error);
      return;
    }

    const knownMinutes = executableStops.reduce((total, stop) => total + (stop.dwellMinutes ?? 0), 0);
    const ignoredDwell = resolvedIssues.filter((issue) => issue.type === "DWELL_TIME" && issue.status === "IGNORED").length;
    const routeStops: SavedRoute["stops"] = executableStops.map(({ id, name, verification, dwellMinutes, evidence, confidence }) => ({
      id,
      name,
      verification,
      dwellMinutes,
      evidence,
      ...(confidence === "FUZZY" ? {} : { confidence }),
    }));
    const route: SavedRoute = {
      id: createJourneyId("route"),
      title: snapshot.plan.title,
      plannedDate: "",
      duration: ignoredDwell ? `已填写 ${knownMinutes} 分钟 · ${ignoredDwell} 站明确忽略时长` : `${knownMinutes} 分钟`,
      pace: "游记提取",
      note: "由游客粘贴文本提取并逐项消歧；正式执行校验仍为 BLOCKED，仅可进入本机演示。",
      transport,
      sourceText: text,
      status: "DEMO_ONLY",
      planId: snapshot.plan.id,
      revision: snapshot.plan.revision,
      validationStatus: snapshot.plan.validation.status,
      unresolvedCount: snapshot.plan.unresolved.filter((issue) => issue.status === "UNRESOLVED").length,
      createdAt: now,
      updatedAt: now,
      stops: routeStops,
    };
    const current = readJourneyData();
    if (!current.error) {
      const journeyWrite = writeJourneyData({ ...current.data, routes: [route, ...current.data.routes], updatedAt: now });
      setNotice(journeyWrite.ok
        ? "路线已经保存到“我的旅程”。出发前请结合当天开放与通行信息再次确认。"
        : `路线已保存，但“我的旅程”暂时无法更新：${journeyWrite.error}`);
    } else {
      setNotice(`路线已保存，但“我的旅程”暂时无法读取：${current.error}`);
    }
    setSavedPlanId(snapshot.plan.id);
    setStage("SAVED");
  }

  const showReview = Boolean(extraction && (stops.length || extraction.ambiguities.length || issues.length));

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 lg:grid-cols-[.9fr_1.1fr] lg:py-16">
      <section>
        <SectionHeader
          level={1}
          className="section-header--cultural"
          meta="Diary to journey"
          title="把游记，变成有证据的候选行程"
          description="粘贴一段你有权使用的游记文字，系统会识别地点、停留时间与行程偏好。遇到同名或模糊地点时，请由你确认后再生成路线。"
        />
        <label className="mt-8 block text-sm font-semibold" htmlFor="travel-note">游记或行程描述</label>
        <textarea id="travel-note" value={text} onChange={(event) => resetForText(event.target.value)} className="mt-2 min-h-56 w-full resize-y rounded-2xl border border-[#173f35]/14 bg-white/60 p-4 leading-7 outline-none focus:border-[#b88a43]" />
        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#173f35]/12 bg-white/45 p-4 text-xs leading-5 text-[#607169]">
          <input type="checkbox" checked={remoteConsent} onChange={(event) => setRemoteConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#173f35]" />
          <span><strong className="block text-[#294c41]">允许本次使用已配置的远程 AI</strong>默认不勾选时，完整游记只按本地规则处理。勾选后，若项目已启用远程提取，本文本会发送给配置的 Gemini 服务；未启用时仍自动使用本地规则。</span>
        </label>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={extract} disabled={!text.trim() || extracting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3.5 font-medium text-white transition-transform active:scale-[.98] disabled:opacity-45"><Sparkle size={18} weight="duotone" />{extracting ? "正在安全提取…" : "提取并保留未决信息"}</button>
          <button type="button" onClick={() => resetForText("")} className="rounded-full border border-[#173f35]/15 px-5 py-3.5 text-sm transition-transform active:scale-[.98]">清空</button>
        </div>
        <div className="mt-6 rounded-2xl bg-[#e7eee8] p-4 text-sm leading-6 text-[#536b61]"><Warning className="mr-2 inline" size={18} weight="duotone" />游记原文与路线选择默认只保存在当前浏览器。是否使用智能识别由你逐次确认，你也可以随时清除本机记录。</div>
      </section>

      <section className="rounded-[2rem] border border-[#173f35]/10 bg-[#fffaf0] p-5 shadow-[0_24px_70px_rgba(44,69,58,.12)] md:p-8">
        <div className="flex items-center justify-between gap-4"><div><span className="text-xs text-[#78857f]">结构化结果</span><h2 className="mt-1 text-2xl font-semibold">行程校对</h2></div><span className="rounded-full bg-[#efe4d3] px-3 py-1.5 text-xs">{stage === "INPUT" ? "等待提取" : stage === "REVIEW" ? "待确认" : "快照已保存"}</span></div>
        {notice && <p className="mt-5 rounded-xl border border-[#b88a43]/18 bg-[#f5ecdf] p-3 text-sm leading-6" aria-live="polite">{notice}</p>}
        {!showReview ? (
          <div className="grid min-h-56 place-items-center text-center"><div><MapPin className="mx-auto text-[#b88a43]" size={34} weight="duotone" /><p className="mt-3 text-sm text-[#708078]">提取后，地点、原文证据、多候选和待处理信息会出现在这里。</p></div></div>
        ) : (
          <>
            {extraction && extraction.ambiguities.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">多候选消歧</h3><span className="rounded-full bg-[#f0dfc1] px-2 py-1 text-[10px] font-semibold">{unresolvedAmbiguityCount} 组待决定</span></div>
                {extraction.ambiguities.map((ambiguity) => {
                  const draft = ambiguityDrafts[ambiguity.id] ?? emptyAmbiguityDraft;
                  const choice = draft.decision === "EXCLUDED" ? "EXCLUDED" : draft.selectedCandidateId;
                  return (
                    <fieldset key={ambiguity.id} className="rounded-2xl border border-[#b88a43]/24 bg-[#fff8ed] p-4">
                      <legend className="px-1 text-xs font-semibold text-[#6d604c]">原文“{ambiguity.evidence}”</legend>
                      <p className="mt-1 text-xs leading-5 text-[#786c5b]">{ambiguity.reason}</p>
                      <label className="mt-3 block text-xs font-semibold" htmlFor={`ambiguity-${ambiguity.id}`}>明确选择一个地点，或排除这段表达</label>
                      <select id={`ambiguity-${ambiguity.id}`} value={choice} onChange={(event) => chooseAmbiguity(ambiguity, event.target.value)} className="mt-2 w-full rounded-xl border border-[#173f35]/14 bg-white px-3 py-3 text-sm">
                        <option value="">尚未决定</option>
                        {ambiguity.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.eligibleForRoute ? "" : "（不可演示）"}</option>)}
                        <option value="EXCLUDED">明确排除，不加入站序</option>
                      </select>
                      {draft.decision && (
                        <label className="mt-3 block text-xs font-semibold" htmlFor={`ambiguity-reason-${ambiguity.id}`}>决定说明（必填，用于本机审计）
                          <input id={`ambiguity-reason-${ambiguity.id}`} value={draft.reason} onChange={(event) => { setAmbiguityDrafts((current) => ({ ...current, [ambiguity.id]: { ...draft, reason: event.target.value } })); markDirty(); }} placeholder={draft.decision === "EXCLUDED" ? "例如：原文只是文化主题，不是目的地" : "例如：游客确认这里指国恩寺"} className="mt-2 w-full rounded-xl border border-[#173f35]/14 bg-white px-3 py-2.5 font-normal" />
                        </label>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            )}

            {stops.length > 0 && (
              <>
                <ol className="mt-5 divide-y divide-[#173f35]/10 border-y border-[#173f35]/10">
                  {stops.map((stop, index) => (
                    <li key={`${stop.id}-${stop.ambiguityId ?? "exact"}`} className="py-5"><div className="grid grid-cols-[32px_1fr_auto] gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full text-xs text-white ${stop.eligibleForRoute ? "bg-[#173f35]" : "bg-[#b64b40]"}`}>{index + 1}</span><div><div className="flex flex-wrap items-center gap-2"><strong>{stop.name}</strong><span className="rounded-full bg-[#e7eee8] px-2 py-1 text-[10px] font-semibold text-[#526b60]">{stop.confidence === "EXPLICIT" ? "原名明确匹配" : stop.confidence === "ALIAS" ? "别名匹配待确认" : "游客从多候选中选择"}</span>{!stop.eligibleForRoute && <span className="rounded-full bg-[#f7ddd7] px-2 py-1 text-[10px] font-semibold text-[#9f3f37]">不可进入演示站序</span>}</div><blockquote className="mt-2 border-l-2 border-[#b88a43] pl-3 text-xs leading-5 text-[#6d7b74]">“{stop.evidence}”</blockquote><p className="mt-2 text-[11px] leading-5 text-[#78857f]">{stop.reviewNote}</p><label className="mt-3 flex items-center gap-2 text-xs" htmlFor={`dwell-${stop.id}`}>停留 <input id={`dwell-${stop.id}`} type="number" min={10} max={240} step={5} value={stop.dwellMinutes ?? ""} onChange={(event) => setDwell(index, event.target.value)} placeholder="待定" className="w-20 rounded-lg border border-[#173f35]/15 bg-white px-2 py-1.5" /> 分钟</label></div><div className="flex flex-col gap-1"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`上移${stop.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-[#173f35]/12 transition-transform active:scale-[.98] disabled:opacity-25"><ArrowUp size={14} /></button><button type="button" onClick={() => move(index, 1)} disabled={index === stops.length - 1} aria-label={`下移${stop.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-[#173f35]/12 transition-transform active:scale-[.98] disabled:opacity-25"><ArrowDown size={14} /></button><button type="button" onClick={() => removeStop(stop)} aria-label={`移除${stop.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-[#d95a4a]/20 text-[#b64b40] transition-transform active:scale-[.98]"><Trash size={14} /></button></div></div></li>
                  ))}
                </ol>
                <label className="mt-5 block text-sm font-semibold" htmlFor="transport">点位间交通方式</label>
                <select id="transport" value={transport} onChange={(event) => { setTransport(event.target.value); markDirty(); }} className="mt-2 w-full rounded-xl border border-[#173f35]/14 bg-white px-3 py-3"><option>自驾/网约车</option><option>公共交通</option><option>步行优先（需核验）</option></select>
              </>
            )}
          </>
        )}

        {extraction && issues.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[#b88a43]/22 bg-[#fff8ed] p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">约束与未知片段处理</h3><span className="rounded-full bg-[#f0dfc1] px-2 py-1 text-[10px] font-semibold">{unresolvedIssueCount} 项未解决</span></div>
            <div className="mt-3 space-y-3">
              {issues.map((issue) => {
                const draft = issueDrafts[issue.id] ?? emptyIssueDraft;
                const closed = issueIsClosed(issue, stops, draft);
                return (
                  <fieldset key={issue.id} className="rounded-xl border border-[#b88a43]/18 bg-white/65 p-3">
                    <legend className="px-1 text-xs font-semibold">{issueLabels[issue.type]} · {closed ? "已处理" : "待处理"}</legend>
                    <p className="mt-1 text-xs leading-5 text-[#6d604c]">{issue.message}</p>
                    <span className="mt-1 block text-[11px] text-[#817564]">原文：“{issue.evidence}”</span>
                    {issue.type === "DWELL_TIME" ? (
                      <p className="mt-3 text-xs leading-5 text-[#61736a]">在对应候选站填写 10 至 240 分钟即可解决；若确实不需要时长，请在下方明确忽略并说明原因。</p>
                    ) : null}
                    <label className="mt-3 block text-xs font-semibold" htmlFor={`resolution-${issue.id}`}>处理方式</label>
                    <select id={`resolution-${issue.id}`} value={draft.method} onChange={(event) => updateIssueDraft(issue.id, { method: event.target.value as IssueDraft["method"], value: "", reason: "" })} className="mt-2 w-full rounded-lg border border-[#173f35]/14 bg-white px-3 py-2.5 text-sm">
                      <option value="">{closed && issue.type === "DWELL_TIME" ? "已通过上方停留时间解决" : "尚未处理"}</option>
                      {issue.type !== "DWELL_TIME" && <option value="VALUE_PROVIDED">填写解决值</option>}
                      <option value="EXPLICITLY_IGNORED">明确忽略并记录原因</option>
                    </select>
                    {draft.method === "VALUE_PROVIDED" && issue.type !== "DWELL_TIME" && (
                      <label className="mt-3 block text-xs font-semibold" htmlFor={`resolution-value-${issue.id}`}>解决值（必填）
                        <input id={`resolution-value-${issue.id}`} value={draft.value} onChange={(event) => updateIssueDraft(issue.id, { value: event.target.value })} placeholder={issue.type === "TIME_WINDOW" ? "例如：09:00 至 11:00" : "填写确认后的约束或片段含义"} className="mt-2 w-full rounded-lg border border-[#173f35]/14 bg-white px-3 py-2.5 font-normal" />
                      </label>
                    )}
                    {draft.method && (
                      <label className="mt-3 block text-xs font-semibold" htmlFor={`resolution-reason-${issue.id}`}>{draft.method === "EXPLICITLY_IGNORED" ? "忽略原因" : "解决依据"}（必填）
                        <input id={`resolution-reason-${issue.id}`} value={draft.reason} onChange={(event) => updateIssueDraft(issue.id, { reason: event.target.value })} placeholder={draft.method === "EXPLICITLY_IGNORED" ? "说明为何这项不进入本次演示" : "说明该值由谁确认或来自哪里"} className="mt-2 w-full rounded-lg border border-[#173f35]/14 bg-white px-3 py-2.5 font-normal" />
                      </label>
                    )}
                  </fieldset>
                );
              })}
            </div>
          </div>
        )}
        {extraction && extraction.unrecognizedFragments.length > 0 && <div className="mt-4 rounded-2xl border border-[#a85749]/18 bg-[#f8e8e3] p-4"><h3 className="text-sm font-semibold text-[#84463d]">未识别原文证据已保留</h3><ul className="mt-2 space-y-1 text-xs leading-5 text-[#79564f]">{extraction.unrecognizedFragments.map((fragment) => <li key={`${fragment.start}-${fragment.end}`}>“{fragment.text}”</li>)}</ul></div>}
        {showReview && (
          <div className="mt-6">
            {blockingCount > 0 && <p className="mb-3 rounded-xl bg-[#f8e8e3] px-3 py-2 text-xs leading-5 text-[#84463d]" role="status">还有 {blockingCount} 项必须明确处理；处理前不会创建或保存可演示快照。</p>}
            {stage !== "SAVED" || !savedPlanId ? (
              <button type="button" onClick={saveDraft} disabled={blockingCount > 0 || !executableStops.length} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-4 font-medium text-white transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"><Check size={18} weight="bold" />确认并保存路线</button>
            ) : (
              <Link href={guideHref} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#d95a4a] px-5 py-4 font-medium text-white transition-transform active:scale-[.98]">开始查看逐站导览 <ArrowRight size={18} /></Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
