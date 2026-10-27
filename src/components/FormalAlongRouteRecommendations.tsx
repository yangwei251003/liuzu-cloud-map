"use client";

import { Camera, ChatsCircle, MapPin, SpinnerGap, Tree } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DirectedRoutePlan } from "@/lib/directed-route-engine";
import { parseFormalCommunityPreview, type FormalCommunityPreview } from "@/lib/formal-community-preview";
import {
  findFormalAlongRouteRecommendations,
  type FormalRecommendationNode,
} from "@/lib/formal-route-recommendations";

type CommunityState =
  | { status: "LOADING"; preview: null }
  | { status: "READY"; preview: FormalCommunityPreview }
  | { status: "UNAVAILABLE"; preview: null };

function distanceLabel(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)} km` : `${Math.max(0, Math.round(value / 10) * 10)} m`;
}

export function FormalAlongRouteRecommendations({
  plan,
  nodes,
  progressRatio,
}: {
  plan: DirectedRoutePlan;
  nodes: FormalRecommendationNode[];
  progressRatio: number;
}) {
  const recommendations = useMemo(() => findFormalAlongRouteRecommendations(plan, nodes, progressRatio), [nodes, plan, progressRatio]);
  const communityKey = recommendations.map(({ poiId }) => poiId).join("|");
  const [communities, setCommunities] = useState<Record<string, CommunityState>>({});

  useEffect(() => {
    const placeIds = communityKey ? communityKey.split("|") : [];
    if (placeIds.length === 0) {
      const timer = window.setTimeout(() => setCommunities({}), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const loading = Object.fromEntries(placeIds.map((placeId) => [placeId, { status: "LOADING", preview: null } satisfies CommunityState]));
    const timer = window.setTimeout(() => setCommunities(loading), 0);
    void Promise.all(placeIds.map(async (placeId) => {
      if (navigator.onLine === false) return [placeId, { status: "UNAVAILABLE", preview: null } satisfies CommunityState] as const;
      try {
        const response = await fetch(`/api/v1/social/communities/${encodeURIComponent(placeId)}/posts?limit=3&scenicAreaId=${encodeURIComponent(plan.scenicAreaId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return [placeId, { status: "UNAVAILABLE", preview: null } satisfies CommunityState] as const;
        const value = await response.json() as unknown;
        const preview = parseFormalCommunityPreview(value, placeId, plan.scenicAreaId);
        return [placeId, preview
          ? { status: "READY", preview } satisfies CommunityState
          : { status: "UNAVAILABLE", preview: null } satisfies CommunityState] as const;
      } catch {
        return [placeId, { status: "UNAVAILABLE", preview: null } satisfies CommunityState] as const;
      }
    })).then((entries) => {
      if (!controller.signal.aborted) setCommunities(Object.fromEntries(entries));
    });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [communityKey, plan.scenicAreaId]);

  if (recommendations.length === 0) return null;
  return (
    <section className="mt-4 rounded-2xl border border-[#173f35]/12 bg-[#fffdf7] p-4" aria-labelledby="formal-along-route-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7eee8] text-[#173f35]"><Tree size={21} weight="duotone" /></span>
        <div><h4 id="formal-along-route-title" className="font-semibold text-[#173f35]">沿途已核验推荐</h4><p className="mt-1 text-xs leading-5 text-[#61716a]">只显示当前正式路线 120 米走廊内、仍在前方且带审核证据的景点或设施。</p></div>
      </div>
      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        {recommendations.map((item) => {
          const community = communities[item.poiId];
          return <li key={item.nodeId} className="rounded-xl border border-[#173f35]/10 bg-white p-3">
            <div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-[#173f35]">{item.displayName}</strong><p className="mt-1 text-xs text-[#61716a]">前方约 {distanceLabel(item.distanceAheadMeters)} · 建议停留 {item.dwellMinutes} 分钟</p></div><MapPin className="shrink-0 text-[#b56e45]" size={20} weight="fill" /></div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-[#5f7169]">{item.photoSpot && <span className="rounded-full bg-[#f4eadc] px-2 py-1">拍照点</span>}{item.restArea && <span className="rounded-full bg-[#e7eee8] px-2 py-1">休息点</span>}{item.familyFriendly && <span className="rounded-full bg-[#edf0e8] px-2 py-1">亲子友好</span>}</div>
            <p className="mt-2 break-all text-[10px] leading-4 text-[#7a827d]">游览依据：{item.evidenceReference}</p>
            <div className="mt-3 border-t border-[#173f35]/8 pt-3">
              {!community || community.status === "LOADING" ? <p className="flex items-center gap-2 text-xs text-[#61716a]"><SpinnerGap className="animate-spin motion-reduce:animate-none" size={15} />正在核验地点社区…</p> : community.status === "UNAVAILABLE" ? <p className="text-xs leading-5 text-[#718078]">当前没有可核验的正式社区摘要。</p> : <>
                <p className="flex flex-wrap gap-x-2 text-xs leading-5 text-[#52655c]"><span><ChatsCircle className="mr-1 inline" size={14} />24 小时 {community.preview.postCount} 条审核动态</span><span><Camera className="mr-1 inline" size={14} />{community.preview.photoCount} 张审核照片</span><span>{community.preview.checkInCount} 次公开打卡</span></p>
                {community.preview.posts[0] && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#61716a]"><strong>{community.preview.posts[0].authorDisplayName}：</strong>{community.preview.posts[0].body}</p>}
                <Link href={`/community/${encodeURIComponent(item.poiId)}?source=formal&scenicAreaId=${encodeURIComponent(plan.scenicAreaId)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-[#2369d8] underline decoration-[#2369d8]/35 underline-offset-4">进入已核验地点社区</Link>
              </>}
            </div>
          </li>;
        })}
      </ol>
      <p className="mt-3 text-[10px] leading-4 text-[#7a827d]">游客动态、照片和打卡属于已审核 UGC，不能证明当前开放、客流、道路安全或官方事实；社区请求不包含你的当前位置。</p>
    </section>
  );
}
