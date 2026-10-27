"use client";

import { ArrowSquareOut, Car, Footprints, MagnifyingGlass, MapPin, NavigationArrow, SpinnerGap } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildAmapExternalNavigationUrl, type AmapNavigationMode } from "@/lib/amap-navigation";
import { TravelGroupNavigator } from "@/components/TravelGroupNavigator";
import { getScenicSpotGallery, getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import { scenicSpots } from "@/lib/scenic-data";

type NavigationMode = AmapNavigationMode;

type PublicPoi = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  category: string | null;
  coordinate: [number, number];
  entranceCoordinate: [number, number] | null;
  exitCoordinate: [number, number] | null;
};

type LookupResult = {
  provider: "AMAP_WEB_SERVICE_V5";
  available: boolean;
  query: string;
  region: "云浮市";
  coordinateSystem: "GCJ02";
  fetchedAt: string;
  sourceUrl: string;
  message: string;
  pois: PublicPoi[];
};

function formatCoordinate(coordinate: [number, number]) {
  return `${coordinate[0].toFixed(6)}, ${coordinate[1].toFixed(6)}`;
}

export function PublicNavigationPanel({
  destinationName,
  showTravelGroupControl = true,
}: {
  destinationName: string;
  showTravelGroupControl?: boolean;
}) {
  const [searchText, setSearchText] = useState(destinationName);
  const [activeQuery, setActiveQuery] = useState(destinationName);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<NavigationMode>("walk");

  const load = useCallback(async (query: string, signal?: AbortSignal) => {
    setState("loading");
    setLookup(null);
    setSelectedId(null);
    try {
      const response = await fetch(`/api/map/places?query=${encodeURIComponent(query)}`, { cache: "no-store", signal });
      const result = await response.json() as LookupResult;
      if (!response.ok || !result.available) {
        setLookup(result);
        setState("unavailable");
        return;
      }
      setLookup(result);
      setSelectedId(result.pois[0]?.id ?? null);
      setState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLookup(null);
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    const normalized = destinationName.trim();
    if (!normalized) return;
    const timer = window.setTimeout(() => {
      setSearchText(normalized);
      setActiveQuery(normalized);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [destinationName]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(activeQuery, controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeQuery, load]);

  const selectedPoi = useMemo(() => lookup?.pois.find((poi) => poi.id === selectedId) ?? null, [lookup?.pois, selectedId]);
  const scenicSpot = useMemo(() => scenicSpots.find((spot) => (
    destinationName.includes(spot.name) || selectedPoi?.name.includes(spot.name) || spot.name.includes(selectedPoi?.name ?? "§")
  )) ?? null, [destinationName, selectedPoi?.name]);
  const scenicPhoto = scenicSpot ? getScenicSpotImage(scenicSpot.id as ScenicSpotId, { allowContextual: true }) : null;
  const scenicGallery = scenicSpot ? getScenicSpotGallery(scenicSpot.id as ScenicSpotId) : [];
  const externalNavigationUrl = useMemo(
    () => selectedPoi ? buildAmapExternalNavigationUrl(selectedPoi, mode) : null,
    [mode, selectedPoi],
  );

  return (
    <section id="public-road-navigation" data-public-navigation aria-labelledby="public-navigation-title" className="mt-5 rounded-2xl border border-[#173f35]/14 bg-[#e7eee8] p-4 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[.15em] text-[#76551f]">出发导航</p>
          <h2 id="public-navigation-title" className="mt-1 text-base font-semibold text-[#173f35]">高德地图导航</h2>
        </div>
        <button type="button" onClick={() => void load(activeQuery)} className="min-h-11 rounded-full border border-[#173f35]/16 px-3 text-xs font-medium text-[#173f35] transition-transform active:scale-[.98]">刷新地点</button>
      </div>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const next = searchText.trim();
          if (next.length < 2 || next.length > 80 || next === activeQuery) return;
          setActiveQuery(next);
        }}
      >
        <label htmlFor="public-navigation-destination" className="block text-xs font-semibold text-[#173f35]">想去哪里</label>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#66766e]" size={18} aria-hidden="true" />
            <input
              id="public-navigation-destination"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              minLength={2}
              maxLength={80}
              autoComplete="off"
              enterKeyHint="search"
              placeholder="输入景点、地址或公共设施"
              className="min-h-12 w-full rounded-xl border border-[#173f35]/16 bg-white pl-10 pr-3 text-sm text-[#173f35] outline-none transition focus:border-[#173f35]/55 focus:ring-3 focus:ring-[#b88a43]/30"
            />
          </div>
          <button type="submit" disabled={searchText.trim().length < 2 || state === "loading"} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"><MagnifyingGlass size={17} />搜索</button>
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-[#68766e]">可搜索任意高德公开地点，选中步行或驾车后直接交给高德地图导航。</p>
      </form>

      {state === "loading" && <p role="status" className="mt-3 flex items-center gap-2 text-xs leading-5 text-[#596b62]"><SpinnerGap className="animate-spin motion-reduce:animate-none" size={16} />正在查询高德公开 POI 与可用入口…</p>}

      {state === "unavailable" && <div role="status" className="mt-3 rounded-xl border border-[#b88a43]/25 bg-[#fffaf0] p-3 text-xs leading-5 text-[#675c49]"><strong className="block text-[#725929]">暂未取得高德地点结果</strong><p className="mt-1">{lookup?.message ?? "浏览器暂时无法查询地点服务。"}</p><button type="button" onClick={() => void load(activeQuery)} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#173f35] px-3 text-xs font-semibold text-white">在本站重新查询</button></div>}

      {state === "ready" && lookup && <>
        <p className="mt-3 text-xs leading-5 text-[#596b62]">{lookup.message}</p>
        <details className="mt-3 rounded-xl border border-[#173f35]/12 bg-white/55">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-[#173f35]">更换高德地点<span className="font-normal text-[#68766e]">{lookup.pois.length} 个结果</span></summary>
          <div className="max-h-56 space-y-2 overflow-y-auto border-t border-[#173f35]/10 p-2" role="radiogroup" aria-label={`${activeQuery} 的高德地点结果`}>
            {lookup.pois.map((poi) => {
            const selected = poi.id === selectedId;
            const navigationCoordinate = poi.entranceCoordinate ?? poi.coordinate;
            return <button key={poi.id} type="button" role="radio" aria-checked={selected} onClick={() => setSelectedId(poi.id)} className={`w-full rounded-xl border p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43] ${selected ? "border-[#173f35]/55 bg-white shadow-sm" : "border-[#173f35]/12 bg-white/55"}`}>
              <span className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0 text-[#b88a43]" size={16} weight="fill" /><span><strong className="block text-sm text-[#173f35]">{poi.name}</strong><span className="mt-1 block text-xs leading-5 text-[#61716a]">{poi.address || poi.district || "高德未提供详细地址"}</span>{poi.entranceCoordinate && <span className="mt-1 block text-[11px] leading-4 text-[#725929]">使用高德入口坐标：{formatCoordinate(poi.entranceCoordinate)}</span>}{!poi.entranceCoordinate && <span className="mt-1 block text-[11px] leading-4 text-[#725929]">高德未返回入口坐标，将使用 POI 导航点：{formatCoordinate(navigationCoordinate)}</span>}</span></span>
            </button>;
            })}
          </div>
        </details>

        {selectedPoi && <>
          <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2" aria-label="选择出行方式并开始导航">
            <button type="button" onClick={() => setMode("walk")} aria-pressed={mode === "walk"} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${mode === "walk" ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/16 bg-white/70 text-[#173f35]"}`}><Footprints size={16} />步行</button>
            <button type="button" onClick={() => setMode("car")} aria-pressed={mode === "car"} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${mode === "car" ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/16 bg-white/70 text-[#173f35]"}`}><Car size={16} />驾车</button>
            {externalNavigationUrl ? <a href={externalNavigationUrl} rel="external" className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#173f35] bg-[#fffaf0] px-3 text-xs font-semibold text-[#173f35] shadow-sm transition-transform hover:bg-white active:scale-[.97] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#173f35]"><ArrowSquareOut size={16} weight="bold" />开始导航</a> : null}
          </div>
          <section className="mt-4 overflow-hidden rounded-2xl border border-[#173f35]/14 bg-[#fffdf8] shadow-[0_14px_34px_rgba(23,63,53,.12)]" aria-label={`导航到${selectedPoi.name}`}>
            <div className="flex items-center gap-3 bg-[#173f35] px-4 py-4 text-[#fffaf0]">
              <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white/70 bg-white/10">
                {scenicPhoto ? <Image src={scenicPhoto.asset.src} alt={`${scenicPhoto.asset.subjectLabel}实景头像`} fill sizes="48px" className="object-cover" /> : <NavigationArrow size={22} weight="fill" />}
              </span>
              <div className="min-w-0"><p className="text-[11px] font-semibold tracking-[.15em] text-white/70">{mode === "walk" ? "步行导航" : "驾车导航"}</p><h3 className="mt-1 truncate text-base font-semibold">前往 {selectedPoi.name}</h3></div>
              {externalNavigationUrl ? <a href={externalNavigationUrl} rel="external" className="ml-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#e5d3af] bg-[#fffaf0] px-3 text-xs font-semibold text-[#173f35] shadow-sm transition-transform hover:bg-white active:scale-[.97] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"><ArrowSquareOut size={17} weight="bold" />开始导航</a> : null}
            </div>
            <div className="p-4">
              {scenicPhoto ? <div className="mb-4 overflow-hidden rounded-xl border border-[#173f35]/10 bg-white">
                <div className="relative aspect-[16/8]"><Image src={scenicPhoto.asset.src} alt={scenicPhoto.asset.alt} fill sizes="360px" className="object-cover" /></div>
                <div className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-xs font-semibold text-[#173f35]">{scenicPhoto.asset.subjectLabel}实景</span><Link href={`/community/${scenicSpot?.id ?? "guoen-temple"}`} className="text-[11px] font-semibold text-[#8b6430]">查看游客摄影</Link></div>
                {scenicGallery.length > 1 ? <p className="px-3 pb-2 text-[11px] text-[#68766e]">社区精选收录 {scenicGallery.length} 组已登记实景影像</p> : null}
              </div> : null}
              <p className="text-sm font-semibold text-[#173f35]">准备出发</p>
              <p className="mt-1 text-xs leading-6 text-[#61716a]">点击“开始导航”，手机可唤起高德地图，电脑端会打开高德路线页面。</p>
              {!externalNavigationUrl ? <p role="status" className="mt-4 rounded-xl bg-[#fff3df] p-3 text-xs leading-5 text-[#805f31]">当前地点坐标无效，请重新选择高德地点。</p> : null}
              <p className="mt-3 text-[10px] leading-5 text-[#78857f]">目的地优先使用高德提供的入口位置；进入景区后请结合现场标识与工作人员指引。</p>
            </div>
          </section>
          <p className="mt-2 text-[11px] leading-5 text-[#68766e]">公开道路由高德地图提供；景区内部步行请留意当天通行提示。</p>
          {showTravelGroupControl && <div className="mt-3 overflow-hidden rounded-xl border border-[#173f35]/12"><TravelGroupNavigator /></div>}
        </>}
      </>}
    </section>
  );
}
