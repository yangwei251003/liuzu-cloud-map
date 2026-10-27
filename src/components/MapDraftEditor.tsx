"use client";

import {
  ArrowCounterClockwise,
  CheckCircle,
  CloudArrowUp,
  CursorClick,
  DownloadSimple,
  FloppyDisk,
  Info,
  LineSegment,
  MapPin,
  Polygon,
  ShieldWarning,
  SpinnerGap,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { TerraDraw } from "terra-draw";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  MAP_DRAFT_OBJECT_TYPES,
  MAP_DRAFT_INTERESTS,
  MAP_DRAFT_TRAVERSAL_MODES,
  MAP_EDITOR_DRAFT_STORAGE_KEY,
  createEmptyMapEditorDraftCollection,
  createMapEditorDraft,
  mapDraftsToFeatureCollection,
  parseMapDraftGeometry,
  parseMapEditorDraftCollection,
  type MapDraftGeometry,
  type MapDraftInterest,
  type MapDraftObjectType,
  type MapDraftRoutingAttributes,
  type MapDraftTraversalMode,
  type MapEditorDraftCollection,
} from "@/lib/map-editor-draft";
import { addLocalMapData, loadLocalMapData } from "@/lib/map-rendering.client";
import { acquirePmtilesProtocol } from "@/lib/pmtiles-protocol.client";

type DrawMode = "point" | "linestring" | "polygon" | "select";
type FeatureId = string | number;

const OBJECT_TYPE_LABELS: Record<MapDraftObjectType, string> = {
  ENTRANCE: "出入口候选",
  PATH: "道路/步道候选",
  POI: "景点候选",
  FACILITY: "设施候选",
  RECOMMENDED_ROUTE: "推荐路线候选",
  BOUNDARY: "边界候选",
  NOTE: "位置备注",
};

const TRAVERSAL_LABELS: Record<MapDraftTraversalMode, string> = {
  WALKWAY: "步行道路",
  BOARDWALK: "栈道",
  MOUNTAIN_TRAIL: "山路",
  STAIRS: "台阶",
  CABLEWAY: "索道",
  SHUTTLE: "观光车",
};

const INTEREST_LABELS: Record<MapDraftInterest, string> = {
  HISTORY: "历史",
  CULTURE: "文化",
  NATURE: "自然",
  PHOTOGRAPHY: "摄影",
  FAMILY: "亲子",
  REST: "休息",
};

const GEOMETRY_LABELS: Record<MapDraftGeometry["type"], string> = {
  Point: "点位",
  LineString: "线段",
  Polygon: "区域",
};

const modeButtons: Array<{ id: DrawMode; label: string; help: string; icon: typeof MapPin }> = [
  { id: "point", label: "标点", help: "单击地图完成", icon: MapPin },
  { id: "linestring", label: "画线", help: "连续单击，回车完成", icon: LineSegment },
  { id: "polygon", label: "画面", help: "连续单击，回车完成", icon: Polygon },
  { id: "select", label: "选择调整", help: "选择未保存图形", icon: CursorClick },
];

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function newDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type SubmittedDraftReceipt = {
  submissionId: string;
  submissionRevision: number;
  objectCount: number;
  submittedAt: string;
};

function readSubmittedDraftReceipt(value: unknown): SubmittedDraftReceipt | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (
    Object.keys(envelope).sort().join("|") !== ["requestId", "schemaVersion", "receipt"].sort().join("|")
    || envelope.schemaVersion !== 1
    || typeof envelope.requestId !== "string"
    || typeof envelope.receipt !== "object"
    || envelope.receipt === null
    || Array.isArray(envelope.receipt)
  ) return null;
  const receipt = envelope.receipt as Record<string, unknown>;
  if (
    Object.keys(receipt).sort().join("|") !== [
      "schemaVersion", "submissionId", "scenicAreaId", "submissionRevision", "workflowRevision", "state",
      "objectCount", "contentSha256", "submittedAt", "reviewedAt", "decision", "reviewEvidenceReference",
    ].sort().join("|")
    || receipt.schemaVersion !== 1
    || typeof receipt.submissionId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.submissionId)
    || receipt.scenicAreaId !== "liuzu-town"
    || !Number.isSafeInteger(receipt.submissionRevision)
    || receipt.workflowRevision !== 1
    || receipt.state !== "SUBMITTED"
    || !Number.isSafeInteger(receipt.objectCount)
    || typeof receipt.submittedAt !== "string"
    || !Number.isFinite(new Date(receipt.submittedAt).getTime())
  ) return null;
  return {
    submissionId: receipt.submissionId,
    submissionRevision: receipt.submissionRevision as number,
    objectCount: receipt.objectCount as number,
    submittedAt: receipt.submittedAt,
  };
}

function readWorkflowError(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

export function MapDraftEditor() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const pendingFeatureIdRef = useRef<FeatureId | null>(null);
  const submissionAttemptRef = useRef<{ payload: string; idempotencyKey: string } | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [storageMode, setStorageMode] = useState<"loading" | "writable" | "blocked">("loading");
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [collection, setCollection] = useState<MapEditorDraftCollection>(createEmptyMapEditorDraftCollection);
  const [mode, setMode] = useState<DrawMode>("point");
  const [pendingGeometry, setPendingGeometry] = useState<MapDraftGeometry | null>(null);
  const [title, setTitle] = useState("");
  const [objectType, setObjectType] = useState<MapDraftObjectType>("NOTE");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [traversalMode, setTraversalMode] = useState<MapDraftTraversalMode>("WALKWAY");
  const [difficulty, setDifficulty] = useState<MapDraftRoutingAttributes["difficulty"]>("EASY");
  const [scenicScore, setScenicScore] = useState(50);
  const [accessibility, setAccessibility] = useState<MapDraftRoutingAttributes["accessibility"]>("UNKNOWN");
  const [walkingTimeMultiplier, setWalkingTimeMultiplier] = useState(1);
  const [transportServiceName, setTransportServiceName] = useState("");
  const [transportBoardingMinutes, setTransportBoardingMinutes] = useState(2);
  const [transportExpectedWaitMinutes, setTransportExpectedWaitMinutes] = useState(5);
  const [transportInVehicleMinutes, setTransportInVehicleMinutes] = useState(10);
  const [transportScheduleEvidenceReference, setTransportScheduleEvidenceReference] = useState("");
  const [visitInterests, setVisitInterests] = useState<MapDraftInterest[]>(["NATURE"]);
  const [dwellMinutes, setDwellMinutes] = useState(20);
  const [editorialPriority, setEditorialPriority] = useState(50);
  const [familyFriendly, setFamilyFriendly] = useState(false);
  const [restArea, setRestArea] = useState(false);
  const [photoSpot, setPhotoSpot] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);
  const [submissionReceipt, setSubmissionReceipt] = useState<SubmittedDraftReceipt | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCapturedAt(localDateTimeValue(new Date()));
      try {
        const stored = window.localStorage.getItem(MAP_EDITOR_DRAFT_STORAGE_KEY);
        if (stored) {
          const parsed = parseMapEditorDraftCollection(JSON.parse(stored) as unknown);
          if (parsed) {
            setCollection(parsed);
            setStorageMode("writable");
          } else {
            setStorageNotice("浏览器里的旧草稿没有通过严格格式校验，本页没有加载或覆盖它。新增草稿只留在本页内存，请先导出或手工备份旧数据。");
            setStorageMode("blocked");
          }
        } else {
          setStorageMode("writable");
        }
      } catch {
        setStorageNotice("浏览器草稿无法读取。本页仍可绘制，但新增草稿只留在本页内存，也不会覆盖异常内容。");
        setStorageMode("blocked");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (storageMode !== "writable") return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(MAP_EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(collection));
      } catch {
        setStorageNotice("浏览器无法保存草稿；新增草稿只留在本页内存，请立即导出 JSON，避免刷新后丢失。");
        setStorageMode("blocked");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collection, storageMode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const abortController = new AbortController();
    let cancelled = false;
    let releasePmtiles: (() => void) | null = null;

    void (async () => {
      const [maplibregl, terraDrawModule, adapterModule, bundle] = await Promise.all([
        import("maplibre-gl"),
        import("terra-draw"),
        import("terra-draw-maplibre-gl-adapter"),
        loadLocalMapData(abortController.signal),
      ]);
      if (cancelled || !mapContainerRef.current) return;
      releasePmtiles = acquirePmtilesProtocol(maplibregl);
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        center: [112.2229, 22.5924],
        zoom: 14,
        minZoom: 10.8,
        maxZoom: 19,
        attributionControl: false,
        localIdeographFontFamily: "system-ui, sans-serif",
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "liuzu-paper", type: "background", paint: { "background-color": "#edf0ed" } }],
        },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a> · 候选底图',
      }));

      map.on("load", () => {
        if (cancelled) return;
        addLocalMapData(map, bundle, "standard");
        const draw = new terraDrawModule.TerraDraw({
          adapter: new adapterModule.TerraDrawMapLibreGLAdapter({
            map,
            coordinatePrecision: 6,
            prefixId: "liuzu-candidate-draft",
          }),
          modes: [
            new terraDrawModule.TerraDrawPointMode({ editable: true }),
            new terraDrawModule.TerraDrawLineStringMode({ editable: true, showCoordinatePoints: true }),
            new terraDrawModule.TerraDrawPolygonMode({ editable: true, showCoordinatePoints: true }),
            new terraDrawModule.TerraDrawSelectMode({
              flags: {
                point: { feature: { draggable: true } },
                linestring: { feature: { draggable: true, coordinates: { draggable: true, midpoints: true, deletable: true } } },
                polygon: { feature: { draggable: true, coordinates: { draggable: true, midpoints: true, deletable: true } } },
              },
            }),
          ],
        });
        drawRef.current = draw;
        draw.start();
        draw.setMode("point");

        const syncPendingFeature = (id: FeatureId) => {
          const feature = draw.getSnapshotFeature(id);
          const geometry = parseMapDraftGeometry(feature?.geometry);
          if (!geometry) {
            setPendingGeometry(null);
            setFormNotice("当前图形没有通过坐标或几何校验，请重新绘制。");
            return;
          }
          pendingFeatureIdRef.current = id;
          setPendingGeometry(geometry);
          setFormNotice(null);
        };
        draw.on("finish", (id) => {
          syncPendingFeature(id);
          draw.setMode("select");
          draw.selectFeature(id);
          setMode("select");
        });
        draw.on("change", (ids) => {
          const pendingId = pendingFeatureIdRef.current;
          if (pendingId !== null && ids.some((id) => String(id) === String(pendingId))) syncPendingFeature(pendingId);
        });
        setMapStatus("ready");
      });
    })().catch((error: unknown) => {
      if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
        setMapStatus("error");
        setFormNotice("候选编辑能力没有成功载入；系统不会退化为直接修改发布数据的工具。");
      }
    });

    return () => {
      cancelled = true;
      abortController.abort();
      drawRef.current?.stop();
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      releasePmtiles?.();
    };
  }, []);

  function chooseMode(nextMode: DrawMode) {
    const draw = drawRef.current;
    if (!draw || mapStatus !== "ready") return;
    if (nextMode !== "select" && pendingFeatureIdRef.current !== null) {
      draw.removeFeatures([pendingFeatureIdRef.current]);
      pendingFeatureIdRef.current = null;
      setPendingGeometry(null);
      setFormNotice("未保存图形已清除，请在地图上绘制新的候选对象。");
    }
    try {
      draw.setMode(nextMode);
      setMode(nextMode);
    } catch {
      setFormNotice("绘图模式不可用；本页已停止该操作，没有写入任何发布数据。");
    }
  }

  function clearPendingGeometry() {
    const draw = drawRef.current;
    const pendingId = pendingFeatureIdRef.current;
    if (draw && pendingId !== null) draw.removeFeatures([pendingId]);
    pendingFeatureIdRef.current = null;
    setPendingGeometry(null);
    setFormNotice("未保存图形已清除。");
    if (draw) {
      draw.setMode("point");
      setMode("point");
    }
  }

  function invalidateSubmittedVersion() {
    submissionAttemptRef.current = null;
    setSubmissionPhase("idle");
    setSubmissionNotice(null);
    setSubmissionReceipt(null);
  }

  function saveCandidateDraft() {
    setFormNotice(null);
    if (!pendingGeometry) {
      setFormNotice("请先在地图上完成一个点、线或区域。");
      return;
    }
    const capturedDate = new Date(capturedAt);
    if (!capturedAt || Number.isNaN(capturedDate.getTime())) {
      setFormNotice("请填写有效的采集时间。");
      return;
    }
    if (collection.drafts.length >= 200) {
      setFormNotice("本地草稿已达到 200 条上限，请导出后再整理。");
      return;
    }
    const isLineObject = objectType === "PATH" || objectType === "RECOMMENDED_ROUTE";
    const isVisitObject = objectType === "POI" || objectType === "FACILITY";
    const isTransportPath = traversalMode === "CABLEWAY" || traversalMode === "SHUTTLE";
    const draft = createMapEditorDraft({
      id: newDraftId(),
      title,
      objectType,
      geometry: pendingGeometry,
      sourceLabel,
      sourceUrl,
      capturedAt: capturedDate,
      routingAttributes: isLineObject ? {
        traversalMode,
        difficulty,
        scenicScore,
        accessibility,
        walkingTimeMultiplier: isTransportPath ? 1 : walkingTimeMultiplier,
        ...(isTransportPath ? {
          transportService: {
            serviceName: transportServiceName.trim(),
            boardingMinutes: transportBoardingMinutes,
            expectedWaitMinutes: transportExpectedWaitMinutes,
            inVehicleMinutes: transportInVehicleMinutes,
            scheduleEvidenceReference: transportScheduleEvidenceReference.trim(),
          },
        } : {}),
      } : null,
      visitAttributes: isVisitObject ? {
        interests: visitInterests,
        dwellMinutes,
        editorialPriority,
        familyFriendly,
        restArea,
        photoSpot,
      } : null,
      notes,
      now: new Date(),
    });
    if (!draft) {
      setFormNotice("对象类型、几何或元数据没有通过严格校验：入口/景点/设施须为点，道路/推荐路线须为线，边界须为面；标题与来源必填。");
      return;
    }
    invalidateSubmittedVersion();
    setCollection((current) => ({ ...current, drafts: [draft, ...current.drafts] }));
    clearPendingGeometry();
    setTitle("");
    setNotes("");
    setTransportServiceName("");
    setTransportScheduleEvidenceReference("");
    setFormNotice(storageMode === "writable"
      ? "候选对象已保存到当前浏览器草稿区；它仍不是发布地图数据。"
      : "候选对象只保存在本页内存；浏览器旧数据未被覆盖，请立即导出。",
    );
  }

  function deleteDraft(id: string) {
    invalidateSubmittedVersion();
    setCollection((current) => ({ ...current, drafts: current.drafts.filter((draft) => draft.id !== id) }));
  }

  function exportDrafts() {
    const payload = mapDraftsToFeatureCollection(collection);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `liuzu-candidate-map-drafts-${new Date().toISOString().slice(0, 10)}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submitDraftsForReview() {
    if (collection.drafts.length === 0 || submissionPhase === "submitting") return;
    const payload = JSON.stringify({ schemaVersion: 1, collection });
    const existingAttempt = submissionAttemptRef.current;
    const idempotencyKey = existingAttempt?.payload === payload
      ? existingAttempt.idempotencyKey
      : `gis-submit-${newDraftId()}`;
    submissionAttemptRef.current = { payload, idempotencyKey };
    setSubmissionPhase("submitting");
    setSubmissionNotice("正在将当前候选版本送入隔离审核队列；不会直接发布到游客地图。");
    setSubmissionReceipt(null);
    try {
      const response = await fetch("/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (submissionAttemptRef.current?.payload !== payload) return;
      const receipt = readSubmittedDraftReceipt(body);
      if (!response.ok || !receipt) {
        setSubmissionPhase("error");
        setSubmissionNotice(readWorkflowError(body) ?? "审核服务没有返回可验证收据；本地草稿保持不变。");
        return;
      }
      setSubmissionReceipt(receipt);
      setSubmissionPhase("submitted");
      setSubmissionNotice(`已提交候选版本 #${receipt.submissionRevision}，共 ${receipt.objectCount} 个对象；仍需另一位 GIS 审核员处理。`);
    } catch {
      if (submissionAttemptRef.current?.payload !== payload) return;
      setSubmissionPhase("error");
      setSubmissionNotice("无法连接 GIS 审核服务；本地草稿保持不变，可稍后使用同一版本重试。");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-28 pt-5 text-[#173f35] sm:px-6 lg:px-8">
      <section className="rounded-[1.5rem] border border-[#a85749]/20 bg-[#f8e8e3] p-4 text-sm leading-6 text-[#714a43]" role="status">
        <strong className="flex items-center gap-2 text-[#84463d]"><ShieldWarning size={20} weight="fill" />候选草稿隔离区</strong>
        <p className="mt-1">草稿先保存在当前浏览器；只有主动提交且真库、OIDC/MFA 和 GIS 编辑权限同时有效时，才会进入隔离审核队列。任何候选对象都不会直接写入正式路网。</p>
      </section>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="map-shell overflow-hidden rounded-[2rem] border border-[#173f35]/12 bg-[#edf0ed] shadow-[0_24px_70px_rgba(44,69,58,.13)]">
          <div className="flex flex-wrap gap-2 border-b border-[#173f35]/10 bg-[#fffdf8]/92 p-3" aria-label="绘图模式">
            {modeButtons.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" disabled={mapStatus !== "ready"} onClick={() => chooseMode(item.id)} aria-pressed={mode === item.id} title={item.help} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43] disabled:opacity-45 active:scale-[.98] ${mode === item.id ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/15 bg-white"}`}>
                  <Icon size={17} />{item.label}
                </button>
              );
            })}
            <button type="button" disabled={!pendingGeometry} onClick={clearPendingGeometry} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-[#a85749]/20 px-4 py-2 text-xs font-semibold text-[#84463d] disabled:opacity-40 active:scale-[.98]"><ArrowCounterClockwise size={17} />清除未保存图形</button>
          </div>
          <div className="relative h-[620px]">
            <div ref={mapContainerRef} className="h-full w-full" role="region" aria-label="六祖云游候选草稿地图编辑器" />
            <div className="pointer-events-none absolute left-3 top-3 max-w-[270px] rounded-2xl border border-white/70 bg-[#fffdf8]/92 p-3 text-xs leading-5 shadow-lg backdrop-blur">
              <strong>{pendingGeometry ? `待保存：${GEOMETRY_LABELS[pendingGeometry.type]}` : "尚未完成图形"}</strong>
              <span className="mt-1 block text-[#64736c]">线和区域可按 Enter 完成；选择模式可调整未保存图形。</span>
            </div>
            {mapStatus === "loading" && <div className="absolute inset-0 grid place-items-center bg-[#edf0ed]/88 text-sm font-semibold" role="status">正在载入本地 GIS 与候选编辑能力…</div>}
            {mapStatus === "error" && <div className="absolute inset-4 grid place-items-center rounded-3xl border border-[#a85749]/20 bg-[#fff6ed]/96 p-8 text-center text-sm leading-6 text-[#7d453d]" role="alert">编辑器无法载入。系统已失败关闭，没有连接外部底图，也没有写入发布数据。</div>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[1.7rem] border border-[#173f35]/12 bg-white/66 p-4 shadow-[0_18px_50px_rgba(44,69,58,.08)]">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><FloppyDisk size={19} />候选对象元数据</h2>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-xs font-semibold">标题（必填）<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-[#fffdf8] px-3 text-sm font-normal outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b88a43]" placeholder="例如：东侧入口待核点" /></label>
              <label className="grid gap-1.5 text-xs font-semibold">对象类型<select value={objectType} onChange={(event) => setObjectType(event.target.value as MapDraftObjectType)} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-[#fffdf8] px-3 text-sm font-normal">{MAP_DRAFT_OBJECT_TYPES.map((type) => <option key={type} value={type}>{OBJECT_TYPE_LABELS[type]}</option>)}</select></label>
              {(objectType === "PATH" || objectType === "RECOMMENDED_ROUTE") && <fieldset className="grid gap-3 rounded-xl border border-[#173f35]/10 bg-[#f1f4ef] p-3">
                <legend className="px-1 text-xs font-semibold">候选道路权重</legend>
                <label className="grid gap-1 text-[11px] font-semibold">道路类型<select value={traversalMode} onChange={(event) => setTraversalMode(event.target.value as MapDraftTraversalMode)} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal">{MAP_DRAFT_TRAVERSAL_MODES.map((value) => <option key={value} value={value}>{TRAVERSAL_LABELS[value]}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-[11px] font-semibold">难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as MapDraftRoutingAttributes["difficulty"])} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal"><option value="EASY">轻松</option><option value="MODERATE">适中</option><option value="HARD">挑战</option></select></label><label className="grid gap-1 text-[11px] font-semibold">无障碍状态<select value={accessibility} onChange={(event) => setAccessibility(event.target.value as MapDraftRoutingAttributes["accessibility"])} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal"><option value="UNKNOWN">待核验</option><option value="VERIFIED_ACCESSIBLE">已核验可达</option><option value="PARTIAL">部分可达</option><option value="NOT_ACCESSIBLE">不可达</option></select></label></div>
                <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-[11px] font-semibold">观光评分 0–100<input type="number" min={0} max={100} step={1} value={scenicScore} onChange={(event) => setScenicScore(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label>{!(traversalMode === "CABLEWAY" || traversalMode === "SHUTTLE") && <label className="grid gap-1 text-[11px] font-semibold">步行耗时系数 0.5–5<input type="number" min={0.5} max={5} step={0.05} value={walkingTimeMultiplier} onChange={(event) => setWalkingTimeMultiplier(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label>}</div>
                {(traversalMode === "CABLEWAY" || traversalMode === "SHUTTLE") && <fieldset className="grid gap-2 rounded-lg border border-[#b88a43]/24 bg-[#fff8e9] p-3">
                  <legend className="px-1 text-[11px] font-semibold">交通服务证据（正式化必填）</legend>
                  <label className="grid gap-1 text-[11px] font-semibold">服务名称<input value={transportServiceName} onChange={(event) => setTransportServiceName(event.target.value)} maxLength={120} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" placeholder={traversalMode === "CABLEWAY" ? "经管理方核验的索道名称" : "经管理方核验的观光车线路名称"} /></label>
                  <div className="grid grid-cols-3 gap-2"><label className="grid gap-1 text-[10px] font-semibold">登乘分钟<input type="number" min={0} max={30} step={0.5} value={transportBoardingMinutes} onChange={(event) => setTransportBoardingMinutes(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label><label className="grid gap-1 text-[10px] font-semibold">预计候乘分钟<input type="number" min={0} max={120} step={0.5} value={transportExpectedWaitMinutes} onChange={(event) => setTransportExpectedWaitMinutes(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label><label className="grid gap-1 text-[10px] font-semibold">乘行分钟<input type="number" min={0.5} max={240} step={0.5} value={transportInVehicleMinutes} onChange={(event) => setTransportInVehicleMinutes(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label></div>
                  <label className="grid gap-1 text-[11px] font-semibold">班次/服务证据 HTTPS<input type="url" value={transportScheduleEvidenceReference} onChange={(event) => setTransportScheduleEvidenceReference(event.target.value)} maxLength={500} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" placeholder="https://…" /></label>
                  <p className="text-[10px] leading-4 text-[#725929]">交通线必须只有上下客两个端点；开放状态仍由短期运营快照独立发布，票价和现场排队不会从草稿推断。</p>
                </fieldset>}
                <p className="text-[10px] leading-4 text-[#6b7972]">距离由正式入库流程从 WGS84 几何计算，不接受手填；这些权重仍需 GIS 与管理方审核。</p>
              </fieldset>}
              {(objectType === "POI" || objectType === "FACILITY") && <fieldset className="grid gap-3 rounded-xl border border-[#173f35]/10 bg-[#f1f4ef] p-3">
                <legend className="px-1 text-xs font-semibold">候选游览属性</legend>
                <div className="flex flex-wrap gap-1.5">{MAP_DRAFT_INTERESTS.map((interest) => <button key={interest} type="button" aria-pressed={visitInterests.includes(interest)} onClick={() => setVisitInterests((current) => current.includes(interest) ? current.filter((value) => value !== interest) : [...current, interest])} className={`min-h-9 rounded-full border px-2.5 text-[11px] font-semibold ${visitInterests.includes(interest) ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/14 bg-white"}`}>{INTEREST_LABELS[interest]}</button>)}</div>
                <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-[11px] font-semibold">建议停留分钟<input type="number" min={5} max={180} step={5} value={dwellMinutes} onChange={(event) => setDwellMinutes(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label><label className="grid gap-1 text-[11px] font-semibold">编辑优先级 0–100<input type="number" min={0} max={100} step={1} value={editorialPriority} onChange={(event) => setEditorialPriority(Number(event.target.value))} className="min-h-10 rounded-lg border border-[#173f35]/14 bg-white px-2 text-xs font-normal" /></label></div>
                <div className="grid gap-2 text-[11px]"><label className="flex items-center gap-2"><input type="checkbox" checked={familyFriendly} onChange={(event) => setFamilyFriendly(event.target.checked)} />亲子友好</label><label className="flex items-center gap-2"><input type="checkbox" checked={restArea} onChange={(event) => setRestArea(event.target.checked)} />可休息</label><label className="flex items-center gap-2"><input type="checkbox" checked={photoSpot} onChange={(event) => setPhotoSpot(event.target.checked)} />拍照点</label></div>
              </fieldset>}
              <label className="grid gap-1.5 text-xs font-semibold">来源说明（必填）<input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} maxLength={180} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-[#fffdf8] px-3 text-sm font-normal" placeholder="现场记录人、公开资料或待核来源" /></label>
              <label className="grid gap-1.5 text-xs font-semibold">来源链接（可选，仅 HTTPS）<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={500} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-[#fffdf8] px-3 text-sm font-normal" placeholder="https://…" /></label>
              <label className="grid gap-1.5 text-xs font-semibold">采集时间<input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} className="min-h-11 rounded-xl border border-[#173f35]/15 bg-[#fffdf8] px-3 text-sm font-normal" /></label>
              <label className="grid gap-1.5 text-xs font-semibold">核验备注<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1_000} rows={3} className="rounded-xl border border-[#173f35]/15 bg-[#fffdf8] p-3 text-sm font-normal leading-6" placeholder="记录需要现场确认的方向、可达性或权利信息" /></label>
            </div>
            {formNotice && <p className="mt-3 rounded-xl border border-[#b88a43]/20 bg-[#f4eadb] p-3 text-xs leading-5" aria-live="polite">{formNotice}</p>}
            <button type="button" onClick={saveCandidateDraft} disabled={mapStatus !== "ready" || !pendingGeometry} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[.99]"><FloppyDisk size={19} weight="fill" />保存为本地候选草稿</button>
          </section>

          <section className="rounded-[1.7rem] border border-[#173f35]/12 bg-white/66 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">本地草稿 · {collection.drafts.length}</h2>
              <button type="button" disabled={collection.drafts.length === 0} onClick={exportDrafts} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#173f35]/15 px-3 text-xs font-semibold disabled:opacity-40 active:scale-[.98]"><DownloadSimple size={16} />导出</button>
            </div>
            <button type="button" disabled={collection.drafts.length === 0 || submissionPhase === "submitting"} onClick={() => void submitDraftsForReview()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#315944] px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[.98]">
              {submissionPhase === "submitting" ? <SpinnerGap size={17} className="animate-spin" /> : submissionPhase === "submitted" ? <CheckCircle size={17} weight="fill" /> : <CloudArrowUp size={17} />}
              {submissionPhase === "submitting" ? "正在提交隔离审核" : submissionPhase === "submitted" ? "已提交专业审核" : "提交专业审核"}
            </button>
            {submissionNotice && <p className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${submissionPhase === "submitted" ? "border-[#315944]/18 bg-[#e7eee8] text-[#315944]" : submissionPhase === "error" ? "border-[#a85749]/20 bg-[#f8e8e3] text-[#714a43]" : "border-[#b88a43]/20 bg-[#f4eadb]"}`} role="status">{submissionNotice}{submissionReceipt && <span className="mt-1 block text-[10px]">提交 ID：{submissionReceipt.submissionId} · {new Date(submissionReceipt.submittedAt).toLocaleString("zh-CN", { hour12: false })}</span>}</p>}
            {storageNotice && <p className="mt-3 rounded-xl border border-[#a85749]/20 bg-[#f8e8e3] p-3 text-xs leading-5 text-[#714a43]">{storageNotice}</p>}
            {collection.drafts.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[#173f35]/16 p-5 text-center text-xs leading-5 text-[#6c7973]"><Info size={22} className="mx-auto mb-2" />还没有已保存的本地候选草稿。</div>
            ) : (
              <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                {collection.drafts.map((draft) => (
                  <li key={draft.id} className="rounded-xl border border-[#173f35]/10 bg-[#fffdf8] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><strong className="block text-sm leading-5">{draft.title}</strong><span className="mt-1 block text-[11px] leading-5 text-[#6b7972]">{OBJECT_TYPE_LABELS[draft.objectType]} · {GEOMETRY_LABELS[draft.geometry.type]} · WGS84</span></div>
                      <button type="button" onClick={() => deleteDraft(draft.id)} aria-label={`删除候选草稿：${draft.title}`} className="grid size-11 shrink-0 place-items-center rounded-full text-[#8a5148] hover:bg-[#f8e8e3] active:scale-[.96]"><Trash size={17} /></button>
                    </div>
                    <p className="mt-2 border-t border-[#173f35]/8 pt-2 text-[11px] leading-5 text-[#6b7972]">来源：{draft.source.label}<br />状态：候选草稿 · 未发布 · 未现场核验</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
