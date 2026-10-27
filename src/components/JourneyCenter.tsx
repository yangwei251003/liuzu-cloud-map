"use client";

import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  BookBookmark,
  CalendarDots,
  CheckCircle,
  CloudCheck,
  CloudSlash,
  Copy,
  DeviceMobile,
  DownloadSimple,
  FloppyDisk,
  MapPin,
  Notebook,
  Path,
  PencilSimple,
  Plus,
  SealCheck,
  ShareNetwork,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { scenicSpots } from "@/lib/scenic-data";
import {
  JOURNEY_STORAGE_KEY,
  clearJourneyData,
  createEmptyJourneyData,
  createJourneyId,
  formatTravelogueText,
  journeyHasContent,
  readJourneyData,
  reviseSavedRoute,
  writeJourneyData,
  type JourneyData,
  type JourneyStop,
  type SavedRoute,
  type TravelogueDraft,
} from "@/lib/journey-store";
import {
  ROUTE_SHARE_STORAGE_KEY,
  addRouteShareRecord,
  buildRouteShareUrl,
  createEmptyRouteShareRegistry,
  createRouteSharePayload,
  encodeRouteShareToken,
  getRouteShareRecordStatus,
  readRouteShareRegistry,
  revokeRouteShareRecord,
  writeRouteShareRegistry,
  type RouteShareRecord,
  type RouteShareRegistry,
} from "@/lib/route-share";
import {
  SERVER_ROUTE_SHARE_STORAGE_KEY,
  addServerRouteShareRecord,
  buildServerRouteShareUrl,
  createEmptyServerRouteShareRegistry,
  createServerRouteShareInput,
  getServerRouteShareStatus,
  markServerRouteShareRevoked,
  parseCreatedServerRouteShare,
  readServerRouteShareRegistry,
  writeServerRouteShareRegistry,
  type ServerRouteShareRecord,
  type ServerRouteShareRegistry,
} from "@/lib/server-route-share";
import {
  VISITOR_AUTH_STATE_EVENT,
  parseVisitorApiError,
  parseVisitorSessionResponse,
  type VisitorSummary,
} from "@/lib/visitor-account";
import { AccessibleDialog } from "./AccessibleDialog";

const fieldClass =
  "w-full rounded-xl border border-[#173f35]/15 bg-white/70 px-3.5 py-3 text-sm text-[#173f35] outline-none transition-colors placeholder:text-[#7a8982] focus:border-[#b88a43] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]";

const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-medium text-[#fffaf0] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45";

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/15 bg-white/55 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

type RouteForm = {
  title: string;
  plannedDate: string;
  duration: string;
  pace: string;
  note: string;
  stopIds: string[];
};

type DraftForm = {
  title: string;
  body: string;
  routeId: string;
};

type RouteEditForm = {
  title: string;
  plannedDate: string;
  duration: string;
  pace: string;
  note: string;
  transport: string;
  stops: JourneyStop[];
};

type VisitorShareState =
  | { kind: "checking" }
  | { kind: "disabled" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; visitor: VisitorSummary }
  | { kind: "error" };

const transportOptions = ["未指定", "自驾/网约车", "公共交通", "步行优先（需核验）"];
const paceOptions = ["轻松", "均衡", "深度", "游记提取"];

const initialRouteForm: RouteForm = {
  title: "寻源半日线",
  plannedDate: "",
  duration: "3 小时",
  pace: "均衡",
  note: "",
  stopIds: ["guoen-temple", "huineng-residence", "longshan-spring"],
};

const initialDraftForm: DraftForm = {
  title: "",
  body: "",
  routeId: "",
};

function routeToEditForm(route: SavedRoute): RouteEditForm {
  return {
    title: route.title,
    plannedDate: route.plannedDate,
    duration: route.duration,
    pace: route.pace,
    note: route.note,
    transport: route.transport ?? "未指定",
    stops: route.stops.map((stop) => ({ ...stop, dwellMinutes: stop.dwellMinutes ?? null })),
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPlannedDate(value: string): string {
  if (!value) return "日期待定";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.4rem] border border-dashed border-[#173f35]/20 bg-white/30 px-5 py-8 text-center">
      <Path className="mx-auto text-[#b88a43]" size={27} weight="duotone" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-6 text-[#66776f]">{description}</p>
    </div>
  );
}

function LoadingJourneyCenter() {
  return (
    <main className="paper-noise min-h-[100dvh] px-4 py-8 md:px-8" aria-busy="true" aria-label="正在读取本地旅程">
      <div className="mx-auto max-w-[1400px] animate-pulse">
        <div className="h-12 w-44 rounded-full bg-[#173f35]/9" />
        <div className="mt-16 h-8 w-32 rounded bg-[#173f35]/9" />
        <div className="mt-5 h-16 max-w-2xl rounded bg-[#173f35]/9" />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 rounded-[1.5rem] bg-[#173f35]/7" />
          ))}
        </div>
        <div className="mt-12 h-80 rounded-[2rem] bg-[#173f35]/7" />
      </div>
      <span className="sr-only">正在读取保存在此设备上的路线、印章与游记草稿。</span>
    </main>
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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

export function JourneyCenter() {
  const [data, setData] = useState<JourneyData>(createEmptyJourneyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<RouteForm>(initialRouteForm);
  const [routeFormError, setRouteFormError] = useState<string | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeEditForm, setRouteEditForm] = useState<RouteEditForm | null>(null);
  const [routeEditError, setRouteEditError] = useState<string | null>(null);
  const [stampSpotId, setStampSpotId] = useState(scenicSpots[0]?.id ?? "");
  const [stampNote, setStampNote] = useState("");
  const [stampError, setStampError] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState<DraftForm>(initialDraftForm);
  const [draftFormError, setDraftFormError] = useState<string | null>(null);
  const [clearConfirming, setClearConfirming] = useState(false);
  const [shareRegistry, setShareRegistry] = useState<RouteShareRegistry>(createEmptyRouteShareRegistry);
  const [shareRegistryError, setShareRegistryError] = useState<string | null>(null);
  const [serverShareRegistry, setServerShareRegistry] = useState<ServerRouteShareRegistry>(createEmptyServerRouteShareRegistry);
  const [serverShareRegistryError, setServerShareRegistryError] = useState<string | null>(null);
  const [transientServerShareUrls, setTransientServerShareUrls] = useState<Record<string, string>>({});
  const [visitorShareState, setVisitorShareState] = useState<VisitorShareState>({ kind: "checking" });
  const [serverSharePending, setServerSharePending] = useState(false);
  const [sharePreviewRoute, setSharePreviewRoute] = useState<SavedRoute | null>(null);
  const [shareActionError, setShareActionError] = useState<string | null>(null);
  const [revokeConfirmingId, setRevokeConfirmingId] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const historyRef = useRef<JourneyData[]>([]);
  const routeEditorHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const load = () => {
      const result = readJourneyData();
      setData(result.data);
      setError(result.error);
      setLoading(false);
    };

    const loadShares = () => {
      const result = readRouteShareRegistry();
      setShareRegistry(result.registry);
      setShareRegistryError(result.error);
    };

    const loadServerShares = () => {
      const result = readServerRouteShareRegistry();
      setServerShareRegistry(result.registry);
      setServerShareRegistryError(result.error);
    };

    const controller = new AbortController();
    const inspectVisitor = async () => {
      try {
        const response = await fetch("/api/v1/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const body = (await response.json()) as unknown;
        if (response.ok) {
          const parsed = parseVisitorSessionResponse(body);
          setVisitorShareState(parsed ? { kind: "signed-in", visitor: parsed.visitor } : { kind: "error" });
          return;
        }
        const apiError = parseVisitorApiError(body);
        if (response.status === 401 && apiError?.code === "AUTH_REQUIRED") {
          setVisitorShareState({ kind: "signed-out" });
          return;
        }
        if (response.status === 503 && apiError?.code === "CAPABILITY_DISABLED") {
          setVisitorShareState({ kind: "disabled" });
          return;
        }
        setVisitorShareState({ kind: "error" });
      } catch (inspectError) {
        if (!(inspectError instanceof DOMException && inspectError.name === "AbortError")) {
          setVisitorShareState({ kind: "error" });
        }
      }
    };

    load();
    loadShares();
    loadServerShares();
    void inspectVisitor();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === JOURNEY_STORAGE_KEY || event.key === null) {
        historyRef.current = [];
        setUndoCount(0);
        setEditingRouteId(null);
        setRouteEditForm(null);
        setRouteEditError(null);
        load();
        setNotice("已同步此设备另一页面中的旅程更新。");
      }
      if (event.key === ROUTE_SHARE_STORAGE_KEY || event.key === null) loadShares();
      if (event.key === SERVER_ROUTE_SHARE_STORAGE_KEY || event.key === null) loadServerShares();
    };
    const handleAuthState = () => void inspectVisitor();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleAuthState);
    window.addEventListener(VISITOR_AUTH_STATE_EVENT, handleAuthState);
    return () => {
      controller.abort();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleAuthState);
      window.removeEventListener(VISITOR_AUTH_STATE_EVENT, handleAuthState);
    };
  }, []);

  useEffect(() => {
    if (!sharePreviewRoute) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSharePreviewRoute(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sharePreviewRoute]);

  useEffect(() => {
    if (!editingRouteId) return;
    const frame = window.requestAnimationFrame(() => routeEditorHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editingRouteId]);

  const selectedDraft = useMemo(
    () => data.drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [data.drafts, selectedDraftId],
  );

  const canUndo = undoCount > 0;
  const hasContent = journeyHasContent(data);

  function rememberCurrentState() {
    historyRef.current = [...historyRef.current.slice(-19), data];
    setUndoCount(historyRef.current.length);
  }

  function commit(next: JourneyData, message: string, mode: "write" | "clear" = "write"): boolean {
    const result = mode === "clear" ? clearJourneyData() : writeJourneyData(next);
    if (!result.ok) {
      setError(result.error);
      setNotice(null);
      return false;
    }
    rememberCurrentState();
    setData(next);
    setError(null);
    setNotice(message);
    return true;
  }

  function retryLoad() {
    setLoading(true);
    const result = readJourneyData();
    historyRef.current = [];
    setUndoCount(0);
    setData(result.data);
    setError(result.error);
    setEditingRouteId(null);
    setRouteEditForm(null);
    setRouteEditError(null);
    setLoading(false);
    if (!result.error) setNotice("已重新读取本地旅程。");
  }

  function clearUnreadableData() {
    const result = clearJourneyData();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    historyRef.current = [];
    setUndoCount(0);
    setData(createEmptyJourneyData());
    setError(null);
    setNotice("损坏的本地数据已清除，可以重新开始记录。");
  }

  function undoLastChange() {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    const result = writeJourneyData(previous);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    historyRef.current = historyRef.current.slice(0, -1);
    setUndoCount(historyRef.current.length);
    setData(previous);
    setError(null);
    setNotice("已撤销上一步本地修改。");
  }

  function clearAll() {
    const empty = createEmptyJourneyData();
    if (!commit(empty, "此设备上的旅程已清除；你仍可撤销这一步。", "clear")) return;
    setSelectedDraftId(null);
    setDraftForm(initialDraftForm);
    setEditingRouteId(null);
    setRouteEditForm(null);
    setRouteEditError(null);
    setClearConfirming(false);
  }

  function toggleRouteStop(spotId: string) {
    setRouteForm((current) => ({
      ...current,
      stopIds: current.stopIds.includes(spotId)
        ? current.stopIds.filter((id) => id !== spotId)
        : [...current.stopIds, spotId],
    }));
    setRouteFormError(null);
  }

  function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = routeForm.title.trim();
    if (!title) {
      setRouteFormError("请为这条路线填写名称。");
      return;
    }
    if (routeForm.stopIds.length === 0) {
      setRouteFormError("请至少选择一个途经地点。");
      return;
    }

    const now = new Date().toISOString();
    const route: SavedRoute = {
      id: createJourneyId("route"),
      title,
      plannedDate: routeForm.plannedDate,
      duration: routeForm.duration,
      pace: routeForm.pace,
      note: routeForm.note.trim(),
      revision: 1,
      stops: routeForm.stopIds
        .map((id) => scenicSpots.find((spot) => spot.id === id))
        .filter((spot): spot is (typeof scenicSpots)[number] => Boolean(spot))
        .map((spot) => ({ id: spot.id, name: spot.name, verification: spot.verification })),
      createdAt: now,
      updatedAt: now,
    };

    const next = { ...data, routes: [route, ...data.routes], updatedAt: now };
    if (commit(next, `路线“${route.title}”已保存在此设备。`)) {
      setRouteForm({ ...initialRouteForm, title: "我的新路线", plannedDate: "", note: "" });
      setRouteFormError(null);
    }
  }

  function startEditingRoute(route: SavedRoute) {
    setEditingRouteId(route.id);
    setRouteEditForm(routeToEditForm(route));
    setRouteEditError(null);
    setNotice(null);
  }

  function cancelRouteEdit() {
    setEditingRouteId(null);
    setRouteEditForm(null);
    setRouteEditError(null);
  }

  function moveEditingStop(index: number, direction: -1 | 1) {
    setRouteEditForm((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.stops.length) return current;
      const stops = [...current.stops];
      [stops[index], stops[target]] = [stops[target], stops[index]];
      return { ...current, stops };
    });
    setRouteEditError(null);
  }

  function removeEditingStop(index: number) {
    setRouteEditForm((current) => current ? { ...current, stops: current.stops.filter((_, stopIndex) => stopIndex !== index) } : current);
    setRouteEditError(null);
  }

  function setEditingStopDwell(index: number, value: string) {
    setRouteEditForm((current) => {
      if (!current) return current;
      const stops = current.stops.map((stop, stopIndex) => (
        stopIndex === index ? { ...stop, dwellMinutes: value === "" ? null : Number(value) } : stop
      ));
      return { ...current, stops };
    });
    setRouteEditError(null);
  }

  function saveEditedRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRouteId || !routeEditForm) return;
    const currentRoute = data.routes.find((route) => route.id === editingRouteId);
    if (!currentRoute) {
      setRouteEditError("这条路线已不存在，请重新读取本地旅程。");
      return;
    }

    const result = reviseSavedRoute(currentRoute, routeEditForm, new Date().toISOString());
    if (!result.ok) {
      setRouteEditError(result.error);
      return;
    }
    if (!result.changed) {
      setRouteEditError(null);
      setNotice("没有检测到实际修改；路线修订号保持不变。");
      return;
    }

    const next = {
      ...data,
      routes: data.routes.map((route) => route.id === currentRoute.id ? result.route : route),
      updatedAt: result.route.updatedAt,
    };
    if (commit(next, `路线“${result.route.title}”已保存为修订 ${result.route.revision}；旧计划绑定已清空，需重新生成/校验。已有分享仍是生成时的独立快照，不会自动同步。`)) {
      cancelRouteEdit();
    }
  }

  function deleteRoute(route: SavedRoute) {
    const now = new Date().toISOString();
    const next = {
      ...data,
      routes: data.routes.filter((item) => item.id !== route.id),
      drafts: data.drafts.map((draft) => (draft.routeId === route.id ? { ...draft, routeId: null, updatedAt: now } : draft)),
      updatedAt: now,
    };
    const committed = commit(next, `路线“${route.title}”已删除；需要时可撤销。`);
    if (committed && draftForm.routeId === route.id) {
      setDraftForm((current) => ({ ...current, routeId: "" }));
    }
    if (committed && editingRouteId === route.id) cancelRouteEdit();
  }

  function addStamp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const spot = scenicSpots.find((item) => item.id === stampSpotId);
    if (!spot) {
      setStampError("请选择一个可记录的地点。");
      return;
    }
    if (data.stamps.some((stamp) => stamp.spotId === spot.id)) {
      setStampError("这个节点已经留有印章，可以先撤销旧印章再重新记录。");
      return;
    }

    const now = new Date().toISOString();
    const next = {
      ...data,
      stamps: [
        {
          id: createJourneyId("stamp"),
          spotId: spot.id,
          spotName: spot.name,
          note: stampNote.trim(),
          stampedAt: now,
        },
        ...data.stamps,
      ],
      updatedAt: now,
    };
    if (commit(next, `已为“${spot.name}”留下个人印章。`)) {
      setStampNote("");
      setStampError(null);
    }
  }

  function removeStamp(stampId: string, spotName: string) {
    const now = new Date().toISOString();
    const next = { ...data, stamps: data.stamps.filter((stamp) => stamp.id !== stampId), updatedAt: now };
    commit(next, `“${spotName}”印章已撤销；需要时可撤销这一步。`);
  }

  function startNewDraft() {
    setSelectedDraftId(null);
    setDraftForm(initialDraftForm);
    setDraftFormError(null);
    setNotice("已打开一篇空白游记草稿。");
  }

  function editDraft(draft: TravelogueDraft) {
    setSelectedDraftId(draft.id);
    setDraftForm({ title: draft.title, body: draft.body, routeId: draft.routeId ?? "" });
    setDraftFormError(null);
    document.querySelector("#travelogue-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftForm.title.trim();
    if (!title) {
      setDraftFormError("请先填写游记标题，正文可以稍后再写。");
      return;
    }

    const now = new Date().toISOString();
    const existing = data.drafts.find((draft) => draft.id === selectedDraftId);
    const draft: TravelogueDraft = {
      id: existing?.id ?? createJourneyId("draft"),
      title,
      body: draftForm.body,
      routeId: draftForm.routeId || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const drafts = existing
      ? data.drafts.map((item) => (item.id === existing.id ? draft : item))
      : [draft, ...data.drafts];
    const next = { ...data, drafts, updatedAt: now };
    if (commit(next, `游记“${draft.title}”已保存在此设备。`)) {
      setSelectedDraftId(draft.id);
      setDraftFormError(null);
    }
  }

  function deleteDraft(draft: TravelogueDraft) {
    const now = new Date().toISOString();
    const next = { ...data, drafts: data.drafts.filter((item) => item.id !== draft.id), updatedAt: now };
    if (commit(next, `游记“${draft.title}”已删除；需要时可撤销。`) && selectedDraftId === draft.id) {
      setSelectedDraftId(null);
      setDraftForm(initialDraftForm);
    }
  }

  function exportDraft(draft: TravelogueDraft) {
    const route = data.routes.find((item) => item.id === draft.routeId);
    const safeName = draft.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) || "六祖云游游记";
    downloadText(`${safeName}.txt`, formatTravelogueText(draft, route));
    setNotice(`游记“${draft.title}”已导出为文本。`);
  }

  async function shareDraft(draft: TravelogueDraft) {
    const route = data.routes.find((item) => item.id === draft.routeId);
    const text = formatTravelogueText(draft, route);
    try {
      if (navigator.share) {
        await navigator.share({ title: draft.title, text });
        setNotice(`已打开“${draft.title}”的系统分享面板。`);
      } else {
        await copyText(text);
        setNotice(`当前浏览器没有系统分享，已复制“${draft.title}”的文本。`);
      }
      setError(null);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      try {
        await copyText(text);
        setNotice(`分享未完成，已改为复制“${draft.title}”的文本。`);
        setError(null);
      } catch {
        setError("无法调用系统分享或剪贴板。请先导出文本，再从文件中分享。");
      }
    }
  }

  function openRouteSharePreview(route: SavedRoute) {
    setSharePreviewRoute(route);
    setShareActionError(null);
  }

  function shareUrl(record: RouteShareRecord): string {
    return buildRouteShareUrl(record.token, window.location.origin);
  }

  async function shareExistingRoute(record: RouteShareRecord) {
    const url = shareUrl(record);
    try {
      if (navigator.share) {
        await navigator.share({ title: record.routeTitle, text: "一条来自六祖云游的 7 天只读路线", url });
        setNotice(`已打开“${record.routeTitle}”的系统分享面板。`);
      } else {
        await copyText(url);
        setNotice(`当前浏览器没有系统分享，已复制“${record.routeTitle}”的链接。`);
      }
      setShareActionError(null);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      try {
        await copyText(url);
        setNotice(`系统分享未完成，已改为复制“${record.routeTitle}”的链接。`);
        setShareActionError(null);
      } catch {
        setShareActionError("无法调用系统分享或剪贴板，请从打开后的分享页地址栏复制链接。");
      }
    }
  }

  async function shareExistingServerRoute(record: ServerRouteShareRecord, url: string | null) {
    if (!url) {
      setShareActionError("跨设备链接只会在刚创建的当前页面中保留；刷新后请重新创建链接，或直接远程撤销。");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: record.routeTitle, text: "一条来自六祖云游的 7 天跨设备只读路线", url });
        setNotice(`已打开“${record.routeTitle}”的系统分享面板。`);
      } else {
        await copyText(url);
        setNotice(`跨设备链接已复制，可发送给其他设备查看“${record.routeTitle}”。`);
      }
      setShareActionError(null);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      try {
        await copyText(url);
        setNotice(`系统分享未完成，跨设备链接已改为复制。`);
        setShareActionError(null);
      } catch {
        setShareActionError("跨设备分享已创建，但无法调用系统分享或剪贴板。请使用本页“查看”后的分享按钮，或重新创建链接。");
      }
    }
  }

  async function createAndShareLocalRoute() {
    if (!sharePreviewRoute || shareRegistryError) return;
    try {
      const payload = createRouteSharePayload(sharePreviewRoute);
      const token = encodeRouteShareToken(payload);
      const record: RouteShareRecord = {
        shareId: payload.shareId,
        routeId: sharePreviewRoute.id,
        routeTitle: payload.route.title,
        token,
        createdAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        revokedAt: null,
      };
      const next = addRouteShareRecord(shareRegistry, record);
      const written = writeRouteShareRegistry(next);
      if (!written.ok) {
        setShareActionError(written.error);
        return;
      }
      setShareRegistry(next);
      setSharePreviewRoute(null);
      setShareActionError(null);
      setNotice(`“${record.routeTitle}”的 7 天只读链接已生成。`);
      await shareExistingRoute(record);
    } catch {
      setShareActionError("这条路线包含无法识别的节点或字段，未生成分享链接。请重新保存路线后再试。");
    }
  }

  async function createAndShareServerRoute(route: SavedRoute) {
    setServerSharePending(true);
    setShareActionError(null);
    try {
      const response = await fetch("/api/v1/share-links", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(createServerRouteShareInput(route)),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        const apiError = parseVisitorApiError(body);
        if (response.status === 401 && apiError?.code === "AUTH_REQUIRED") {
          setVisitorShareState({ kind: "signed-out" });
          setShareActionError("游客会话已失效，未生成本机替代链接。请先登录后重新确认分享。 ");
          return;
        }
        if (response.status === 503 && apiError?.code === "CAPABILITY_DISABLED") {
          setVisitorShareState({ kind: "disabled" });
          setShareActionError("跨设备分享尚未完成运行配置，未伪装成功。你可以重新确认后生成明确标注的本机演示链接。 ");
          return;
        }
        setShareActionError(apiError?.message ?? "跨设备分享创建失败，未生成本机替代链接，请稍后重试。 ");
        return;
      }
      const created = parseCreatedServerRouteShare(body);
      if (!created) {
        setShareActionError("服务端返回的分享凭据无法通过校验，未展示或保存该链接。 ");
        return;
      }
      const record: ServerRouteShareRecord = {
        shareId: created.shareId,
        routeId: route.id,
        routeTitle: route.title,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        revokedAt: null,
      };
      const shareUrl = buildServerRouteShareUrl(created.shareToken, window.location.origin);
      const next = addServerRouteShareRecord(serverShareRegistry, record);
      const written = writeServerRouteShareRegistry(next);
      setServerShareRegistry(next);
      setTransientServerShareUrls((current) => ({ ...current, [record.shareId]: shareUrl }));
      setSharePreviewRoute(null);
      if (!written.ok) setServerShareRegistryError(written.error);
      else setServerShareRegistryError(null);
      setNotice(`“${record.routeTitle}”的跨设备只读链接已创建，可由当前游客账号远程撤销。`);
      await shareExistingServerRoute(record, shareUrl);
    } catch {
      setShareActionError("跨设备分享请求未得到可信结果，未生成本机替代链接。请稍后重试。 ");
    } finally {
      setServerSharePending(false);
    }
  }

  async function createAndShareRoute() {
    if (!sharePreviewRoute || visitorShareState.kind === "checking" || serverSharePending) return;
    if (visitorShareState.kind === "signed-in") {
      await createAndShareServerRoute(sharePreviewRoute);
      return;
    }
    await createAndShareLocalRoute();
  }

  function revokeShare(record: RouteShareRecord) {
    try {
      const next = revokeRouteShareRecord(shareRegistry, record.shareId);
      const written = writeRouteShareRegistry(next);
      if (!written.ok) {
        setShareActionError(written.error);
        return;
      }
      setShareRegistry(next);
      setRevokeConfirmingId(null);
      setShareActionError(null);
      setNotice(`已在本机撤销“${record.routeTitle}”。其他设备上的旧链接无法远程收回，仍会在原到期时间失效。`);
    } catch {
      setShareActionError("本机撤销未完成，请重新读取页面后再试。");
    }
  }

  async function revokeServerShare(record: ServerRouteShareRecord) {
    setServerSharePending(true);
    setShareActionError(null);
    try {
      const response = await fetch(`/api/v1/share-links/${encodeURIComponent(record.shareId)}/revoke`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        const apiError = parseVisitorApiError(body);
        if (response.status === 401 && apiError?.code === "AUTH_REQUIRED") setVisitorShareState({ kind: "signed-out" });
        setShareActionError(apiError?.message ?? "服务端未确认撤销，链接仍按原状态显示。 ");
        return;
      }
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        (body as { schemaVersion?: unknown }).schemaVersion !== 1 ||
        (body as { state?: unknown }).state !== "REVOKED"
      ) {
        setShareActionError("撤销响应无法通过校验，页面没有声称链接已撤销。 ");
        return;
      }
      const next = markServerRouteShareRevoked(serverShareRegistry, record.shareId);
      const written = writeServerRouteShareRegistry(next);
      setServerShareRegistry(next);
      setTransientServerShareUrls((current) => {
        const remaining = { ...current };
        delete remaining[record.shareId];
        return remaining;
      });
      setRevokeConfirmingId(null);
      if (!written.ok) setServerShareRegistryError(written.error);
      setNotice(`已远程撤销“${record.routeTitle}”；其他设备再次打开时将被服务端阻断。`);
    } catch {
      setShareActionError("撤销请求未得到可信结果，链接仍按原状态显示。 ");
    } finally {
      setServerSharePending(false);
    }
  }

  if (loading) return <LoadingJourneyCenter />;

  return (
    <main className="paper-noise min-h-[100dvh] overflow-hidden pb-16">
      <header className="sticky top-0 z-40 border-b border-[#173f35]/10 bg-[#f7f1e7]/90 backdrop-blur-xl">
        <div className="mx-auto grid min-h-18 max-w-[1400px] grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium" aria-label="返回六祖云游首页">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#173f35]/12 bg-white/55">
              <ArrowLeft size={19} aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">返回首页</span>
          </Link>
          <nav className="mx-auto hidden items-center gap-7 text-sm text-[#586c63] md:flex" aria-label="我的旅程导航">
            <a href="#saved-routes">路线</a>
            <a href="#route-shares">分享</a>
            <a href="#stamps">印章</a>
            <a href="#travelogues">游记</a>
            <Link href="/journey/knowledge">知识卡</Link>
            <Link href="/account">账号</Link>
          </nav>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#b88a43]/25 bg-white/55 px-3 py-2 text-xs font-medium text-[#6d624e]">
            {visitorShareState.kind === "signed-in" ? <CloudCheck size={16} weight="duotone" aria-hidden="true" /> : <DeviceMobile size={16} weight="duotone" aria-hidden="true" />}
            {visitorShareState.kind === "signed-in" ? `已登录 ${visitorShareState.visitor.handle}` : "本地保存 · 主动分享"}
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-12 pt-12 md:grid-cols-[1.08fr_.92fr] md:px-8 md:pb-18 md:pt-20">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[.22em] text-[#9b7a42]">My quiet archive</span>
          <h1 className="mt-4 max-w-[12ch] text-4xl font-semibold leading-[1.02] tracking-[-.055em] md:text-6xl">把走过的路，留成自己的旅程</h1>
          <p className="mt-6 max-w-[60ch] text-base leading-8 text-[#607169]">
            保存想走的路线、为亲自到过的地点留一枚印章，再把片刻写成游记或来源知识卡。内容默认留在当前浏览器；只有你主动生成链接时，最小路线摘要才会进入链接，登录也不会自动上传其余内容。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/journey/knowledge" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/15 bg-white/45 px-4 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2"><BookBookmark size={18} weight="duotone" aria-hidden="true" />查看我的知识卡</Link>
            <Link href="/account" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#b88a43]/28 bg-[#f2e6d5] px-4 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2">{visitorShareState.kind === "signed-in" ? "管理游客账号" : "按需登录跨设备分享"}</Link>
          </div>
        </div>

        <aside className="self-end rounded-[2rem] border border-[#173f35]/10 bg-[#173f35] p-6 text-[#fffaf0] shadow-[0_28px_70px_rgba(23,63,53,.17)] md:p-8">
          <div className="flex items-start gap-3">
            <CloudSlash className="mt-0.5 shrink-0 text-[#d4b57b]" size={27} weight="duotone" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">本地内容，按需联网分享</h2>
              <p className="mt-2 text-sm leading-6 text-white/68">清除浏览器数据会一并移除旅程。重要游记请先导出文本；已登录创建的跨设备链接必须在分享区单独远程撤销，本机演示链接则只能在本浏览器阻断。</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={undoLastChange} disabled={!canUndo} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/18 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/8 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35">
              <ArrowCounterClockwise size={18} aria-hidden="true" />撤销上一步
            </button>
            {!clearConfirming ? (
              <button type="button" onClick={() => setClearConfirming(true)} disabled={!hasContent} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4b57b]/35 px-4 py-2.5 text-sm font-medium text-[#eedbb5] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35">
                <Trash size={18} aria-hidden="true" />清除全部
              </button>
            ) : (
              <span className="inline-flex flex-wrap gap-2" role="group" aria-label="确认清除全部旅程">
                <button type="button" onClick={clearAll} className="min-h-11 rounded-full bg-[#fffaf0] px-4 py-2.5 text-sm font-semibold text-[#173f35] active:scale-[0.98]">确认清除</button>
                <button type="button" onClick={() => setClearConfirming(false)} aria-label="取消清除全部旅程" className="grid h-11 w-11 place-items-center rounded-full border border-white/18"><X size={18} /></button>
              </span>
            )}
          </div>
        </aside>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 md:px-8" aria-label="旅程数据概览">
        <dl className="grid grid-cols-4 divide-x divide-[#173f35]/12 border-y border-[#173f35]/12 py-5">
          {[
            ["已存路线", data.routes.length],
            ["分享记录", shareRegistry.records.length + serverShareRegistry.records.length],
            ["到访印章", data.stamps.length],
            ["游记草稿", data.drafts.length],
          ].map(([label, value]) => (
            <div key={label} className="px-3 first:pl-0 md:px-6">
              <dt className="text-xs text-[#718078]">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-.04em] md:text-3xl">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        {error && (
          <div className="mt-8 flex flex-col gap-4 rounded-[1.4rem] border border-[#b76555]/30 bg-[#fff4ed] p-4 text-[#6e362e] sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div className="flex items-start gap-3">
              <WarningCircle className="mt-0.5 shrink-0" size={22} weight="duotone" aria-hidden="true" />
              <p className="text-sm leading-6">{error}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={retryLoad} className="rounded-full border border-current/25 px-4 py-2 text-sm font-medium">重新读取</button>
              <button type="button" onClick={clearUnreadableData} className="rounded-full bg-[#6e362e] px-4 py-2 text-sm font-medium text-white">清除本地数据</button>
            </div>
          </div>
        )}

        <div className="min-h-9 py-3" aria-live="polite" aria-atomic="true">
          {notice && (
            <p className="flex items-center gap-2 text-sm text-[#56725f]">
              <CheckCircle size={18} weight="fill" aria-hidden="true" />{notice}
            </p>
          )}
        </div>
      </div>

      <section id="saved-routes" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 md:px-8 md:py-18">
        <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:gap-14">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">01 · Saved routes</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-5xl">先把想走的路收好</h2>
            <p className="mt-4 max-w-[52ch] text-sm leading-7 text-[#65766f]">这里保存的是个人行前计划。开放、入口与可达性可能变化，请以景区现场信息为准。</p>

            <form className="mt-8 space-y-5 rounded-[1.8rem] border border-[#173f35]/10 bg-white/45 p-5 md:p-6" onSubmit={saveRoute} noValidate>
              <div className="grid gap-2">
                <label htmlFor="route-title" className="text-sm font-semibold">路线名称</label>
                <input id="route-title" value={routeForm.title} onChange={(event) => { setRouteForm((current) => ({ ...current, title: event.target.value })); setRouteFormError(null); }} className={fieldClass} maxLength={60} autoComplete="off" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <label htmlFor="route-date" className="text-sm font-semibold">计划日期</label>
                  <input id="route-date" type="date" value={routeForm.plannedDate} onChange={(event) => setRouteForm((current) => ({ ...current, plannedDate: event.target.value }))} className={fieldClass} />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="route-duration" className="text-sm font-semibold">可用时间</label>
                  <select id="route-duration" value={routeForm.duration} onChange={(event) => setRouteForm((current) => ({ ...current, duration: event.target.value }))} className={fieldClass}>
                    <option>2 小时</option><option>3 小时</option><option>半天</option><option>一天</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="route-pace" className="text-sm font-semibold">游览节奏</label>
                  <select id="route-pace" value={routeForm.pace} onChange={(event) => setRouteForm((current) => ({ ...current, pace: event.target.value }))} className={fieldClass}>
                    <option>轻松</option><option>均衡</option><option>深度</option>
                  </select>
                </div>
              </div>
              <fieldset>
                <legend className="text-sm font-semibold">途经地点</legend>
                <p id="route-stop-help" className="mt-1 text-xs leading-5 text-[#6c7c74]">可保存为计划，不代表节点之间已经形成可导航路线。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-describedby="route-stop-help">
                  {scenicSpots.map((spot) => {
                    const selected = routeForm.stopIds.includes(spot.id);
                    return (
                      <button key={spot.id} type="button" onClick={() => toggleRouteStop(spot.id)} aria-pressed={selected} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors active:scale-[0.98] ${selected ? "border-[#b88a43]/55 bg-[#efe4d3]" : "border-[#173f35]/12 bg-white/45"}`}>
                        <span><strong className="block font-medium">{spot.name}</strong><span className="mt-0.5 block text-[10px] text-[#718078]">{spot.verification}</span></span>
                        {selected && <CheckCircle className="shrink-0 text-[#8b6c35]" size={19} weight="fill" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="grid gap-2">
                <label htmlFor="route-note" className="text-sm font-semibold">给自己的备注 <span className="font-normal text-[#728078]">（可选）</span></label>
                <textarea id="route-note" rows={3} value={routeForm.note} onChange={(event) => setRouteForm((current) => ({ ...current, note: event.target.value }))} className={fieldClass} maxLength={240} placeholder="例如：和家人同行，安排更多休息时间" />
              </div>
              {routeFormError && <p className="text-sm text-[#9b463a]" role="alert">{routeFormError}</p>}
              <button type="submit" className={`${primaryButtonClass} w-full`}><FloppyDisk size={18} aria-hidden="true" />保存这条路线</button>
            </form>
          </div>

          <div className="lg:pt-14">
            {data.routes.length === 0 ? (
              <EmptyState title="还没有保存路线" description="在左侧选好日期、节奏与途经地点，第一条个人路线就会出现在这里。" />
            ) : (
              <div className="divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
                {data.routes.map((route, index) => (
                  <article key={route.id} className="grid gap-5 py-6 md:grid-cols-[44px_1fr_auto] md:items-start">
                    <span className="font-mono text-xs text-[#9b7a42]">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#6c7c74]">
                        <span className="inline-flex items-center gap-1"><CalendarDots size={15} aria-hidden="true" />{formatPlannedDate(route.plannedDate)}</span>
                        <span aria-hidden="true">·</span><span>{route.duration}</span><span aria-hidden="true">·</span><span>{route.pace}</span>
                        <span aria-hidden="true">·</span><span>修订 {route.revision ?? 1}</span>
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-.035em]">{route.title}</h3>
                      <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-[#5f7169]" aria-label={`${route.title}的途经地点`}>
                        {route.stops.map((stop, stopIndex) => (
                          <li key={`${route.id}-${stop.id}`} className="inline-flex items-center gap-2">
                            {stopIndex > 0 && <span className="text-[#b88a43]" aria-hidden="true">→</span>}
                            <span className="rounded-full bg-[#e8e1d5] px-2.5 py-1">{stop.name}</span>
                          </li>
                        ))}
                      </ol>
                      {route.note && <p className="mt-4 border-l-2 border-[#b88a43]/45 pl-3 text-sm leading-6 text-[#65766f]">{route.note}</p>}
                      {route.transport && <p className="mt-3 text-xs text-[#65766f]">点位间交通：{route.transport}</p>}
                      {route.executionStatus === "NEEDS_REVALIDATION" && (
                        <div className="mt-4 rounded-2xl border border-[#b76555]/24 bg-[#fff3e9] p-4 text-xs leading-6 text-[#74463d]" role="status">
                          <strong className="flex items-center gap-2 text-sm"><WarningCircle size={18} weight="duotone" aria-hidden="true" />需重新生成/校验</strong>
                          <p className="mt-1">路线内容已经变化，出发前请重新生成并核对。此前生成的分享链接仍保留当时内容，不会随这里自动更新。</p>
                        </div>
                      )}
                      <p className="mt-4 text-[11px] text-[#7b8882]">保存于 {formatDateTime(route.createdAt)} · 行前计划</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:flex-col">
                      {route.executionStatus === "NEEDS_REVALIDATION" ? (
                        <Link href="/plan" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#8b5d36] px-3 text-xs text-white active:scale-[0.98]" aria-label={`重新生成并校验路线${route.title}`}><ArrowRight size={17} aria-hidden="true" /><span className="md:sr-only">重新生成</span></Link>
                      ) : (
                        <Link href={route.planId ? `/guide?demo=1&planId=${encodeURIComponent(route.planId)}` : `/guide?demo=1&stops=${route.stops.map((stop) => stop.id).join(",")}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#173f35] px-3 text-xs text-white active:scale-[0.98]" aria-label={`演示路线${route.title}`}><ArrowRight size={17} aria-hidden="true" /><span className="md:sr-only">演示</span></Link>
                      )}
                      <button type="button" onClick={() => editingRouteId === route.id ? cancelRouteEdit() : startEditingRoute(route)} aria-label={`编辑路线${route.title}`} aria-expanded={editingRouteId === route.id} aria-controls={`route-editor-${route.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/12 bg-white/45 px-3 text-xs text-[#445b51] active:scale-[0.98] md:w-11 md:px-0"><PencilSimple size={17} aria-hidden="true" /><span className="md:sr-only">编辑</span></button>
                      <button type="button" onClick={() => openRouteSharePreview(route)} disabled={serverSharePending || visitorShareState.kind === "checking" || (visitorShareState.kind !== "signed-in" && Boolean(shareRegistryError))} aria-label={`分享路线${route.title}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#b88a43]/28 bg-[#f4ead9] px-3 text-xs text-[#775d31] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 md:w-11 md:px-0"><ShareNetwork size={17} aria-hidden="true" /><span className="md:sr-only">分享</span></button>
                      <button type="button" onClick={() => deleteRoute(route)} aria-label={`删除路线${route.title}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/12 px-3 text-xs text-[#6d5d54] active:scale-[0.98] md:w-11 md:px-0"><Trash size={17} aria-hidden="true" /><span className="md:sr-only">删除</span></button>
                    </div>
                    {editingRouteId === route.id && routeEditForm && (
                      <form id={`route-editor-${route.id}`} onSubmit={saveEditedRoute} className="md:col-span-3 rounded-[1.7rem] border border-[#b88a43]/24 bg-[#f8f0e4] p-4 md:p-6" noValidate>
                        <div className="flex flex-col gap-3 border-b border-[#173f35]/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Edit saved route</span>
                            <h4 ref={routeEditorHeadingRef} tabIndex={-1} className="mt-1 text-xl font-semibold outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#b88a43]">编辑“{route.title}”</h4>
                            <p className="mt-2 max-w-[68ch] text-xs leading-6 text-[#66766f]">只有实际修改才会生成新修订。保存后旧计划与校验状态会失效；已有分享保持原快照，不会自动同步。</p>
                          </div>
                          <span className="w-fit rounded-full bg-[#eadcc6] px-3 py-1.5 text-[11px] font-medium text-[#725929]">当前修订 {route.revision ?? 1}</span>
                        </div>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="grid gap-2 sm:col-span-2">
                            <label htmlFor={`edit-route-title-${route.id}`} className="text-sm font-semibold">路线名称</label>
                            <input id={`edit-route-title-${route.id}`} value={routeEditForm.title} onChange={(event) => { setRouteEditForm((current) => current ? { ...current, title: event.target.value } : current); setRouteEditError(null); }} className={fieldClass} maxLength={60} autoComplete="off" />
                          </div>
                          <div className="grid gap-2">
                            <label htmlFor={`edit-route-date-${route.id}`} className="text-sm font-semibold">计划日期</label>
                            <input id={`edit-route-date-${route.id}`} type="date" value={routeEditForm.plannedDate} onChange={(event) => { setRouteEditForm((current) => current ? { ...current, plannedDate: event.target.value } : current); setRouteEditError(null); }} className={fieldClass} />
                          </div>
                          <div className="grid gap-2">
                            <label htmlFor={`edit-route-duration-${route.id}`} className="text-sm font-semibold">可用时间</label>
                            <input id={`edit-route-duration-${route.id}`} value={routeEditForm.duration} onChange={(event) => { setRouteEditForm((current) => current ? { ...current, duration: event.target.value } : current); setRouteEditError(null); }} className={fieldClass} maxLength={120} />
                          </div>
                          <div className="grid gap-2">
                            <label htmlFor={`edit-route-pace-${route.id}`} className="text-sm font-semibold">游览节奏</label>
                            <select id={`edit-route-pace-${route.id}`} value={routeEditForm.pace} onChange={(event) => { setRouteEditForm((current) => current ? { ...current, pace: event.target.value } : current); setRouteEditError(null); }} className={fieldClass}>
                              {!paceOptions.includes(routeEditForm.pace) && <option value={routeEditForm.pace}>{routeEditForm.pace}</option>}
                              {paceOptions.map((pace) => <option key={pace}>{pace}</option>)}
                            </select>
                          </div>
                          <div className="grid gap-2">
                            <label htmlFor={`edit-route-transport-${route.id}`} className="text-sm font-semibold">点位间交通</label>
                            <select id={`edit-route-transport-${route.id}`} value={routeEditForm.transport} onChange={(event) => { setRouteEditForm((current) => current ? { ...current, transport: event.target.value } : current); setRouteEditError(null); }} className={fieldClass}>
                              {!transportOptions.includes(routeEditForm.transport) && <option value={routeEditForm.transport}>{routeEditForm.transport}</option>}
                              {transportOptions.map((transport) => <option key={transport}>{transport}</option>)}
                            </select>
                          </div>
                        </div>

                        <fieldset className="mt-5">
                          <legend className="text-sm font-semibold">站序与每站停留</legend>
                          <p id={`edit-route-stops-help-${route.id}`} className="mt-1 text-xs leading-5 text-[#687870]">使用上移、下移调整顺序；移除后至少保留一站。停留时间可留空，或填写 10 至 240 分钟整数。</p>
                          {routeEditForm.stops.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-dashed border-[#b76555]/35 bg-[#fff7ef] p-4 text-sm text-[#7c493f]" role="alert">当前没有途经地点。请取消编辑恢复原路线，或重新生成路线。</div>
                          ) : (
                            <ol className="mt-3 divide-y divide-[#173f35]/10 border-y border-[#173f35]/10" aria-describedby={`edit-route-stops-help-${route.id}`}>
                              {routeEditForm.stops.map((stop, stopIndex) => (
                                <li key={`${stop.id}-${stopIndex}`} className="grid gap-3 py-4 sm:grid-cols-[34px_1fr_auto] sm:items-center">
                                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#173f35] text-xs font-semibold text-white" aria-hidden="true">{stopIndex + 1}</span>
                                  <div className="min-w-0">
                                    <strong className="block text-sm">{stop.name}</strong>
                                    <label htmlFor={`edit-dwell-${route.id}-${stop.id}-${stopIndex}`} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#65766f]">停留
                                      <input id={`edit-dwell-${route.id}-${stop.id}-${stopIndex}`} type="number" min={10} max={240} step={5} inputMode="numeric" value={stop.dwellMinutes ?? ""} onChange={(event) => setEditingStopDwell(stopIndex, event.target.value)} className="w-24 rounded-lg border border-[#173f35]/15 bg-white/75 px-2.5 py-2 text-sm text-[#173f35] outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]" aria-describedby={`edit-route-stops-help-${route.id}`} /> 分钟
                                    </label>
                                  </div>
                                  <div className="flex gap-2" role="group" aria-label={`${stop.name}站序操作`}>
                                    <button type="button" onClick={() => moveEditingStop(stopIndex, -1)} disabled={stopIndex === 0} aria-label={`上移${stop.name}`} className="grid h-11 w-11 place-items-center rounded-full border border-[#173f35]/12 bg-white/55 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"><ArrowUp size={17} aria-hidden="true" /></button>
                                    <button type="button" onClick={() => moveEditingStop(stopIndex, 1)} disabled={stopIndex === routeEditForm.stops.length - 1} aria-label={`下移${stop.name}`} className="grid h-11 w-11 place-items-center rounded-full border border-[#173f35]/12 bg-white/55 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"><ArrowDown size={17} aria-hidden="true" /></button>
                                    <button type="button" onClick={() => removeEditingStop(stopIndex)} aria-label={`移除${stop.name}`} className="grid h-11 w-11 place-items-center rounded-full border border-[#9b463a]/18 bg-white/55 text-[#8a453c] active:scale-[0.98]"><Trash size={17} aria-hidden="true" /></button>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}
                        </fieldset>

                        <div className="mt-5 grid gap-2">
                          <label htmlFor={`edit-route-note-${route.id}`} className="text-sm font-semibold">给自己的备注 <span className="font-normal text-[#728078]">（可选）</span></label>
                          <textarea id={`edit-route-note-${route.id}`} rows={3} value={routeEditForm.note} onChange={(event) => { setRouteEditForm((current) => current ? { ...current, note: event.target.value } : current); setRouteEditError(null); }} className={fieldClass} maxLength={240} />
                        </div>
                        {routeEditError && <p className="mt-4 text-sm text-[#9b463a]" role="alert">{routeEditError}</p>}
                        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                          <button type="submit" className={`${primaryButtonClass} flex-1`}><FloppyDisk size={18} aria-hidden="true" />保存为新修订</button>
                          <button type="button" onClick={cancelRouteEdit} className={secondaryButtonClass}><X size={17} aria-hidden="true" />取消编辑</button>
                        </div>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="route-shares" className="scroll-mt-24 border-y border-[#173f35]/10 bg-white/28 py-12 md:py-18">
        <div className="mx-auto grid max-w-[1400px] gap-9 px-4 md:px-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-14">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">02 · Read-only shares</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-5xl">只分享刚好够看的内容</h2>
            <p className="mt-4 max-w-[52ch] text-sm leading-7 text-[#65766f]">链接默认 7 天有效，只含标题、途经景点名、时长与节奏。每条链接都保留生成时的内容；之后编辑或删除本机路线，不会自动改写已经发出的旧链接。</p>
            <div className="mt-6 border-l-2 border-[#b88a43]/45 pl-4 text-xs leading-6 text-[#6e766f]">
              已登录时优先创建真正的服务端链接，可跨设备读取并远程撤销；未登录或后台未启用时，只生成明确标注的本机演示链接。两种方式都不会上传游记、备注、日期、停留时间或交通安排。
            </div>
          </div>

          <div>
            <div className={`mb-5 flex flex-col gap-3 rounded-[1.4rem] border p-4 sm:flex-row sm:items-center sm:justify-between ${visitorShareState.kind === "signed-in" ? "border-[#5d7d65]/22 bg-[#edf3eb]" : "border-[#b88a43]/24 bg-[#f7ead7]"}`} role="status">
              <div className="flex items-start gap-3">
                {visitorShareState.kind === "signed-in" ? <CloudCheck className="mt-0.5 shrink-0 text-[#416b54]" size={22} weight="duotone" aria-hidden="true" /> : <CloudSlash className="mt-0.5 shrink-0 text-[#76551f]" size={22} weight="duotone" aria-hidden="true" />}
                <div><strong className="text-sm">{visitorShareState.kind === "checking" ? "正在核对分享方式" : visitorShareState.kind === "signed-in" ? `跨设备分享已启用 · ${visitorShareState.visitor.handle}` : visitorShareState.kind === "signed-out" ? "当前未登录 · 使用本机演示分享" : visitorShareState.kind === "disabled" ? "后台未配置 · 使用本机演示分享" : "账号状态未知 · 仅允许本机演示分享"}</strong><p className="mt-1 text-xs leading-5 text-[#52685e]">{visitorShareState.kind === "signed-in" ? "新链接由服务端保存最小路线快照，并可在这里远程撤销。" : "本机演示链接把最小路线摘要放在网址片段中，其他设备收到后无法被远程收回。"}</p></div>
              </div>
              {visitorShareState.kind !== "signed-in" && visitorShareState.kind !== "checking" && <Link href="/account" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[#173f35]/16 bg-white/55 px-4 py-2 text-sm font-semibold active:scale-[0.98]">登录游客账号</Link>}
            </div>
            {shareRegistryError && (
              <div className="mb-5 flex items-start gap-3 rounded-[1.3rem] border border-[#b76555]/28 bg-[#fff4ed] p-4 text-sm leading-6 text-[#7a4138]" role="alert">
                <WarningCircle className="mt-0.5 shrink-0" size={21} weight="duotone" aria-hidden="true" />
                <span>{shareRegistryError}</span>
              </div>
            )}
            {serverShareRegistryError && (
              <div className="mb-5 flex items-start gap-3 rounded-[1.3rem] border border-[#b76555]/28 bg-[#fff4ed] p-4 text-sm leading-6 text-[#7a4138]" role="alert">
                <WarningCircle className="mt-0.5 shrink-0" size={21} weight="duotone" aria-hidden="true" />
                <span>{serverShareRegistryError}</span>
              </div>
            )}
            {shareActionError && (
              <div className="mb-5 flex items-start gap-3 rounded-[1.3rem] border border-[#b76555]/28 bg-[#fff4ed] p-4 text-sm leading-6 text-[#7a4138]" role="alert">
                <WarningCircle className="mt-0.5 shrink-0" size={21} weight="duotone" aria-hidden="true" />
                <span>{shareActionError}</span>
              </div>
            )}
            {shareRegistry.records.length + serverShareRegistry.records.length === 0 ? (
              <EmptyState title="还没有分享链接" description="从上方任一已保存路线点“分享”，先核对最小公开字段，再生成 7 天只读链接。" />
            ) : (
              <div className="divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
                {serverShareRegistry.records.map((record) => {
                  const status = getServerRouteShareStatus(record);
                  const statusText = status === "active" ? "跨设备 · 7 天内有效" : status === "expired" ? "跨设备 · 已到期" : "跨设备 · 已远程撤销";
                  const transientShareUrl = transientServerShareUrls[record.shareId] ?? null;
                  return (
                    <article key={`server-${record.shareId}`} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <span className={`text-[11px] font-medium ${status === "active" ? "text-[#416b54]" : "text-[#8b5146]"}`}>{statusText}</span>
                        <h3 className="mt-1 text-lg font-semibold">{record.routeTitle}</h3>
                        <p className="mt-1 text-xs text-[#718078]">创建于 {formatDateTime(record.createdAt)} · 到期于 {formatDateTime(record.expiresAt)}</p>
                        <p className="mt-1 text-[11px] leading-5 text-[#56725f]">服务端最小快照 · 可由创建账号远程撤销 · 不随本机路线编辑</p>
                      </div>
                      {status === "active" && (
                        <div className="flex flex-wrap gap-2">
                          {transientShareUrl ? (
                            <>
                              <button type="button" onClick={() => void shareExistingServerRoute(record, transientShareUrl)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 bg-white/55 px-3 text-xs font-medium active:scale-[0.98]"><ShareNetwork size={16} aria-hidden="true" />分享/复制</button>
                              <Link href={transientShareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 bg-white/55 px-3 text-xs font-medium active:scale-[0.98]"><ArrowRight size={16} aria-hidden="true" />查看</Link>
                            </>
                          ) : (
                            <p className="max-w-48 self-center text-[11px] leading-5 text-[#6a7972]">链接仅在创建当次显示，刷新后不再保存凭据。</p>
                          )}
                          {visitorShareState.kind === "signed-in" ? revokeConfirmingId !== record.shareId ? (
                            <button type="button" onClick={() => setRevokeConfirmingId(record.shareId)} disabled={serverSharePending} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#9b463a]/18 px-3 text-xs font-medium text-[#8a453c] active:scale-[0.98] disabled:opacity-45"><Trash size={15} aria-hidden="true" />远程撤销</button>
                          ) : (
                            <span className="inline-flex flex-wrap gap-2" role="group" aria-label={`确认远程撤销${record.routeTitle}`}>
                              <button type="button" onClick={() => void revokeServerShare(record)} disabled={serverSharePending} className="min-h-10 rounded-full bg-[#8a453c] px-3 text-xs font-medium text-white active:scale-[0.98] disabled:opacity-45">{serverSharePending ? "正在核对" : "确认远程撤销"}</button>
                              <button type="button" onClick={() => setRevokeConfirmingId(null)} disabled={serverSharePending} className="grid h-10 w-10 place-items-center rounded-full border border-[#173f35]/12" aria-label="取消撤销"><X size={16} aria-hidden="true" /></button>
                            </span>
                          ) : <Link href="/account" className="inline-flex min-h-10 items-center rounded-full border border-[#173f35]/12 bg-white/55 px-3 text-xs font-medium">登录后撤销</Link>}
                        </div>
                      )}
                    </article>
                  );
                })}
                {shareRegistry.records.map((record) => {
                  const status = getRouteShareRecordStatus(record);
                  const statusText = status === "active" ? "本机演示 · 7 天内有效" : status === "expired" ? "本机演示 · 已到期" : "本机演示 · 已在本机撤销";
                  return (
                    <article key={record.shareId} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <span className={`text-[11px] font-medium ${status === "active" ? "text-[#57745f]" : "text-[#8b5146]"}`}>{statusText}</span>
                        <h3 className="mt-1 text-lg font-semibold">{record.routeTitle}</h3>
                        <p className="mt-1 text-xs text-[#718078]">创建于 {formatDateTime(record.createdAt)} · 到期于 {formatDateTime(record.expiresAt)}</p>
                        <p className="mt-1 text-[11px] leading-5 text-[#8a6a38]">自包含网址片段 · 只能本机撤销 · 不随本机路线编辑</p>
                      </div>
                      {status === "active" && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void shareExistingRoute(record)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 bg-white/55 px-3 text-xs font-medium active:scale-[0.98]"><ShareNetwork size={16} aria-hidden="true" />分享/复制</button>
                          <Link href={typeof window === "undefined" ? "/share" : shareUrl(record)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 bg-white/55 px-3 text-xs font-medium active:scale-[0.98]"><ArrowRight size={16} aria-hidden="true" />查看</Link>
                          {revokeConfirmingId !== record.shareId ? (
                            <button type="button" onClick={() => setRevokeConfirmingId(record.shareId)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#9b463a]/18 px-3 text-xs font-medium text-[#8a453c] active:scale-[0.98]"><Trash size={15} aria-hidden="true" />本机撤销</button>
                          ) : (
                            <span className="inline-flex flex-wrap gap-2" role="group" aria-label={`确认在本机撤销${record.routeTitle}`}>
                              <button type="button" onClick={() => revokeShare(record)} className="min-h-10 rounded-full bg-[#8a453c] px-3 text-xs font-medium text-white active:scale-[0.98]">确认本机撤销</button>
                              <button type="button" onClick={() => setRevokeConfirmingId(null)} className="grid h-10 w-10 place-items-center rounded-full border border-[#173f35]/12" aria-label="取消撤销"><X size={16} aria-hidden="true" /></button>
                            </span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="stamps" className="scroll-mt-24 border-y border-[#173f35]/10 bg-[#173f35] py-14 text-[#fffaf0] md:py-20">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 md:px-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-[#d4b57b]">03 · Personal stamps</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-5xl">为亲自到过的地方留印</h2>
            <p className="mt-4 max-w-[50ch] text-sm leading-7 text-white/64">印章由你主动记录，不依赖定位，也不作为官方到访、路线安全或开放状态证明。</p>
            <form onSubmit={addStamp} className="mt-7 space-y-4 rounded-[1.7rem] border border-white/12 bg-white/6 p-5" noValidate>
              <div className="grid gap-2">
                <label htmlFor="stamp-place" className="text-sm font-semibold">到访节点</label>
                <select id="stamp-place" value={stampSpotId} onChange={(event) => { setStampSpotId(event.target.value); setStampError(null); }} className="w-full rounded-xl border border-white/16 bg-[#244b40] px-3.5 py-3 text-sm text-white outline-none focus:border-[#d4b57b] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#d4b57b]">
                  {scenicSpots.map((spot) => <option key={spot.id} value={spot.id}>{spot.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="stamp-note" className="text-sm font-semibold">一句记忆 <span className="font-normal text-white/52">（可选）</span></label>
                <input id="stamp-note" value={stampNote} onChange={(event) => setStampNote(event.target.value)} className="w-full rounded-xl border border-white/16 bg-[#244b40] px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/38 focus:border-[#d4b57b] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#d4b57b]" maxLength={80} placeholder="例如：雨后钟声很轻" />
              </div>
              {stampError && <p className="text-sm text-[#ffd0c6]" role="alert">{stampError}</p>}
              <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fffaf0] px-5 py-3 text-sm font-semibold text-[#173f35] active:scale-[0.98]"><SealCheck size={19} weight="duotone" aria-hidden="true" />留下个人印章</button>
            </form>
          </div>

          <div className="self-center">
            {data.stamps.length === 0 ? (
              <div className="rounded-[1.6rem] border border-dashed border-white/22 px-5 py-12 text-center">
                <SealCheck className="mx-auto text-[#d4b57b]" size={31} weight="duotone" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">印章册还是空的</h3>
                <p className="mt-2 text-sm text-white/58">亲自到达后，由你决定是否留下第一枚印章。</p>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="我的到访印章">
                {data.stamps.map((stamp) => (
                  <li key={stamp.id} className="group relative overflow-hidden rounded-[1.5rem] border border-white/12 bg-white/7 p-5">
                    <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full border-[12px] border-[#d4b57b]/8" aria-hidden="true" />
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#d4b57b]/45 text-[#d4b57b]"><SealCheck size={25} weight="duotone" aria-hidden="true" /></span>
                      <button type="button" onClick={() => removeStamp(stamp.id, stamp.spotName)} aria-label={`撤销${stamp.spotName}印章`} className="grid h-10 w-10 place-items-center rounded-full border border-white/12 text-white/62 active:scale-[0.98]"><X size={16} /></button>
                    </div>
                    <strong className="mt-7 block text-xl font-medium">{stamp.spotName}</strong>
                    <span className="mt-1 block text-xs text-[#d4b57b]">个人记录 · {formatDateTime(stamp.stampedAt)}</span>
                    {stamp.note && <p className="mt-4 text-sm leading-6 text-white/68">{stamp.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section id="travelogues" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-14 md:px-8 md:py-20">
        <div className="flex flex-col gap-5 border-b border-[#173f35]/12 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">04 · Travelogue drafts</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-5xl">把沿途片刻写下来</h2>
          </div>
          <button type="button" onClick={startNewDraft} className={secondaryButtonClass}><Plus size={18} aria-hidden="true" />新建游记</button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-12">
          <div>
            {data.drafts.length === 0 ? (
              <EmptyState title="还没有游记草稿" description="先写下一个标题，哪怕正文只有一句话，也可以随时回来继续编辑。" />
            ) : (
              <div className="divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
                {data.drafts.map((draft) => (
                  <article key={draft.id} className={`py-5 ${selectedDraftId === draft.id ? "bg-white/35" : ""}`}>
                    <button type="button" onClick={() => editDraft(draft)} className="w-full px-2 text-left active:scale-[0.99]" aria-pressed={selectedDraftId === draft.id}>
                      <span className="text-[11px] text-[#7b8882]">更新于 {formatDateTime(draft.updatedAt)}</span>
                      <h3 className="mt-1 text-lg font-semibold">{draft.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#66776f]">{draft.body || "正文还没有开始，点此继续写。"}</p>
                    </button>
                    <div className="mt-4 flex flex-wrap gap-2 px-2">
                      <button type="button" onClick={() => editDraft(draft)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 px-3 text-xs font-medium"><PencilSimple size={15} aria-hidden="true" />编辑</button>
                      <button type="button" onClick={() => exportDraft(draft)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 px-3 text-xs font-medium"><DownloadSimple size={15} aria-hidden="true" />导出</button>
                      <button type="button" onClick={() => void shareDraft(draft)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 px-3 text-xs font-medium"><ShareNetwork size={15} aria-hidden="true" />分享文本</button>
                      <button type="button" onClick={() => deleteDraft(draft)} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-[#9b463a]/18 px-3 text-xs font-medium text-[#8a453c]"><Trash size={15} aria-hidden="true" />删除</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form id="travelogue-editor" className="scroll-mt-24 rounded-[2rem] border border-[#173f35]/10 bg-white/45 p-5 shadow-[0_24px_65px_rgba(35,65,53,.08)] md:p-7" onSubmit={saveDraft} noValidate>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]"><Notebook size={17} weight="duotone" aria-hidden="true" />{selectedDraft ? "Editing draft" : "New draft"}</span>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-.035em]">{selectedDraft ? "继续整理这段旅程" : "从一句话开始"}</h3>
              </div>
              {selectedDraft && <span className="rounded-full bg-[#e6ede7] px-3 py-1.5 text-[11px] text-[#597066]">本地草稿</span>}
            </div>
            <div className="mt-6 grid gap-5">
              <div className="grid gap-2">
                <label htmlFor="draft-title" className="text-sm font-semibold">游记标题</label>
                <input id="draft-title" value={draftForm.title} onChange={(event) => { setDraftForm((current) => ({ ...current, title: event.target.value })); setDraftFormError(null); }} className={fieldClass} maxLength={80} placeholder="例如：雨后走进国恩寺" />
              </div>
              <div className="grid gap-2">
                <label htmlFor="draft-route" className="text-sm font-semibold">关联路线 <span className="font-normal text-[#728078]">（可选）</span></label>
                <select id="draft-route" value={draftForm.routeId} onChange={(event) => setDraftForm((current) => ({ ...current, routeId: event.target.value }))} className={fieldClass}>
                  <option value="">不关联路线</option>
                  {data.routes.map((route) => <option key={route.id} value={route.id}>{route.title}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="draft-body" className="text-sm font-semibold">正文</label>
                  <span className="text-[11px] text-[#7a8881]">{draftForm.body.length} / 6000</span>
                </div>
                <textarea id="draft-body" rows={13} value={draftForm.body} onChange={(event) => setDraftForm((current) => ({ ...current, body: event.target.value }))} className={`${fieldClass} resize-y leading-7`} maxLength={6000} placeholder="写下看见的建筑、听到的声音，以及你愿意带走的一点感受。未经核验的历史说法请保留为个人感受，不写成事实定论。" />
              </div>
            </div>
            {draftFormError && <p className="mt-4 text-sm text-[#9b463a]" role="alert">{draftFormError}</p>}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="submit" className={`${primaryButtonClass} flex-1`}><FloppyDisk size={18} aria-hidden="true" />{selectedDraft ? "保存修改" : "保存草稿"}</button>
              {selectedDraft && (
                <>
                  <button type="button" onClick={() => exportDraft(selectedDraft)} className={secondaryButtonClass}><DownloadSimple size={17} aria-hidden="true" />导出文本</button>
                  <button type="button" onClick={() => void shareDraft(selectedDraft)} className={secondaryButtonClass}><ShareNetwork size={17} aria-hidden="true" />分享</button>
                </>
              )}
            </div>
            {selectedDraft && (
              <div className="mt-5 flex items-center gap-2 border-t border-[#173f35]/10 pt-4 text-xs text-[#6e7d76]">
                <Copy size={15} aria-hidden="true" />分享会发送纯文本，不包含浏览器本地数据文件。
              </div>
            )}
          </form>
        </div>
      </section>

      <footer className="border-t border-[#173f35]/10 px-4 py-8 text-xs text-[#697970] md:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>六祖云游 · 我的旅程由你保存，不作为官方到访或导航记录</span>
          <Link href="/" className="inline-flex items-center gap-2 font-medium underline underline-offset-4"><MapPin size={15} aria-hidden="true" />回到探索地图</Link>
        </div>
      </footer>

      {sharePreviewRoute && (
        <AccessibleDialog onClose={() => setSharePreviewRoute(null)} labelledBy="route-share-preview-title" describedBy="route-share-preview-description" className="m-auto w-[92vw] max-w-lg rounded-[2rem]">
          <section className="p-5 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Share preview</span>
                <h2 id="route-share-preview-title" className="mt-2 text-2xl font-semibold tracking-[-.04em]">确认公开字段</h2>
              </div>
              <button type="button" onClick={() => setSharePreviewRoute(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#173f35]/12 bg-white/55 active:scale-[0.98]" aria-label="关闭分享预览"><X size={18} aria-hidden="true" /></button>
            </div>
            <p id="route-share-preview-description" className="mt-3 text-sm leading-6 text-[#65766f]">下面就是收件人能看到的全部路线字段。链接默认 7 天有效，查看者不要求登录，并固定为此刻的独立快照；之后编辑路线不会自动同步。</p>
            <div className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${visitorShareState.kind === "signed-in" ? "border-[#5d7d65]/22 bg-[#edf3eb] text-[#315443]" : "border-[#b88a43]/25 bg-[#f7ead7] text-[#654f2d]"}`}>
              {visitorShareState.kind === "signed-in" ? <CloudCheck className="mt-0.5 shrink-0" size={21} weight="duotone" aria-hidden="true" /> : <CloudSlash className="mt-0.5 shrink-0" size={21} weight="duotone" aria-hidden="true" />}
              <p>{visitorShareState.kind === "signed-in" ? `将使用游客账号 ${visitorShareState.visitor.handle} 创建跨设备服务端链接，可在这里远程撤销。` : "将创建本机演示链接：最小路线摘要只进入网址片段，不上传后台；发送到其他设备后无法远程撤销。"}</p>
            </div>
            <div className="mt-6 rounded-[1.5rem] border border-[#173f35]/10 bg-white/52 p-5">
              <h3 className="text-xl font-semibold">{sharePreviewRoute.title}</h3>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#63756c]"><span>{sharePreviewRoute.duration}</span><span aria-hidden="true">·</span><span>{sharePreviewRoute.pace}</span></div>
              <ol className="mt-5 flex flex-wrap items-center gap-2 text-sm" aria-label="即将分享的途经地点">
                {sharePreviewRoute.stops.map((stop, index) => <li key={stop.id} className="inline-flex items-center gap-2">{index > 0 && <span className="text-[#b88a43]" aria-hidden="true">→</span>}<span className="rounded-full bg-[#e8e1d5] px-2.5 py-1">{stop.name}</span></li>)}
              </ol>
            </div>
            <p className="mt-4 text-xs leading-6 text-[#6c7972]">不会包含：游记原文、来源证据、计划日期、单点停留时间、交通方式、个人备注或同行约束。</p>
            {shareActionError && <p className="mt-3 text-sm text-[#9b463a]" role="alert">{shareActionError}</p>}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => void createAndShareRoute()} disabled={serverSharePending || visitorShareState.kind === "checking"} autoFocus className={`${primaryButtonClass} flex-1`}><ShareNetwork size={18} aria-hidden="true" />{serverSharePending ? "正在创建并核对" : visitorShareState.kind === "checking" ? "正在核对分享方式" : visitorShareState.kind === "signed-in" ? "创建跨设备 7 天链接" : "生成本机演示 7 天链接"}</button>
              <button type="button" onClick={() => setSharePreviewRoute(null)} className={secondaryButtonClass}>暂不分享</button>
            </div>
          </section>
        </AccessibleDialog>
      )}
    </main>
  );
}
