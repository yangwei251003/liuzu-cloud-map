"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ScenicSpot } from "@/lib/scenic-data";

const DynamicScenicMap = dynamic(
  () => import("./ScenicMap").then((module) => module.ScenicMap),
  { ssr: false, loading: () => <MapLoading /> },
);

type DeferredScenicMapProps = {
  spots: ScenicSpot[];
  selectedId: string;
  onSelect: (id: string) => void;
  activeRoute?: [string, string] | null;
  skin?: "standard" | "theme";
};

export function DeferredScenicMap(props: DeferredScenicMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setShouldLoad(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "320px 0px" });
    if (hostRef.current) observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={hostRef} className="h-full min-h-[520px]">
      {shouldLoad ? <DynamicScenicMap {...props} /> : <div className="grid h-full min-h-[520px] place-items-center bg-[#e9eee5] p-6 text-center"><div><p className="font-semibold">实景候选地图将在接近时载入</p><p className="mt-2 max-w-sm text-sm leading-6 text-[#52655c]">这样可以先读首页内容，减少首屏流量。地图数据仍不作为安全导航依据。</p><button type="button" onClick={() => setShouldLoad(true)} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-[#173f35] px-5 text-sm font-semibold text-white">现在加载地图</button></div></div>}
    </div>
  );
}

function MapLoading() {
  return <div className="grid h-full min-h-[520px] place-items-center bg-[#e9eee5]" role="status"><span className="rounded-full bg-[#fffaf0] px-4 py-3 text-sm font-medium">正在载入地图与候选设施…</span></div>;
}
