"use client";

import { Camera, ChatsCircle, MapPin } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AmapAlongRoutePoi } from "@/lib/amap-along-route";
import { matchAmapPoiCommunity } from "@/lib/amap-community-binding";
import { parseFormalCommunityPreview, type FormalCommunityPreview } from "@/lib/formal-community-preview";
import {
  readPrototypeCheckIns,
  readPrototypePosts,
  subscribeSocialStore,
} from "@/lib/social/prototype-store";

type ServerState =
  | { status: "LOADING"; preview: null }
  | { status: "READY"; preview: FormalCommunityPreview }
  | { status: "UNAVAILABLE"; preview: null };

const emptyPosts = [] as ReturnType<typeof readPrototypePosts>;
const emptyCheckIns = [] as ReturnType<typeof readPrototypeCheckIns>;

export function AmapAlongRouteCommunityPreview({ poi }: { poi: AmapAlongRoutePoi }) {
  const binding = useMemo(() => matchAmapPoiCommunity(poi), [poi]);
  const posts = useSyncExternalStore(subscribeSocialStore, readPrototypePosts, () => emptyPosts);
  const checkIns = useSyncExternalStore(subscribeSocialStore, readPrototypeCheckIns, () => emptyCheckIns);
  const [serverState, setServerState] = useState<ServerState>({ status: "LOADING", preview: null });

  useEffect(() => {
    if (!binding || navigator.onLine === false) {
      const timer = window.setTimeout(() => setServerState({ status: "UNAVAILABLE", preview: null }), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => setServerState({ status: "LOADING", preview: null }), 0);
    void fetch(`/api/v1/social/communities/${encodeURIComponent(binding.placeId)}/posts?limit=3&scenicAreaId=liuzu-town`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      return parseFormalCommunityPreview(await response.json() as unknown, binding.placeId, "liuzu-town");
    }).then((preview) => {
      if (!controller.signal.aborted) setServerState(preview ? { status: "READY", preview } : { status: "UNAVAILABLE", preview: null });
    }).catch(() => {
      if (!controller.signal.aborted) setServerState({ status: "UNAVAILABLE", preview: null });
    });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [binding]);

  if (!binding) return null;
  const devicePosts = posts.filter((post) => post.visibility === "PUBLIC" && post.location.placeId === binding.placeId);
  const deviceCheckIns = checkIns.filter((checkIn) => checkIn.visibility === "PUBLIC" && checkIn.placeId === binding.placeId);
  const formal = serverState.status === "READY" ? serverState.preview : null;
  const postCount = formal?.postCount ?? devicePosts.length;
  const photoCount = formal?.photoCount ?? devicePosts.reduce((total, post) => total + post.media.length, 0);
  const checkInCount = formal?.checkInCount ?? deviceCheckIns.length;
  const latestBody = formal?.posts[0]?.body ?? devicePosts[0]?.body ?? null;
  const sourceLabel = formal ? "社区精选 · 近 24 小时" : serverState.status === "LOADING" ? "正在更新社区内容" : "本机保存的社区内容";

  return (
    <div className="mt-2 border-t border-[#173f35]/10 pt-2">
      <p className="text-[10px] font-semibold text-[#8a682d]">{sourceLabel}</p>
      <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] leading-4 text-[#61716a]">
        <span><ChatsCircle className="mr-0.5 inline" size={13} />{postCount} 条动态</span>
        <span><Camera className="mr-0.5 inline" size={13} />{photoCount} 张照片</span>
        <span><MapPin className="mr-0.5 inline" size={13} />{checkInCount} 次打卡</span>
      </p>
      {latestBody && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#68766e]">{latestBody}</p>}
      <Link href={`/community/${encodeURIComponent(binding.placeId)}?source=amap-route`} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-9 items-center text-[10px] font-semibold text-[#2369d8] underline decoration-[#2369d8]/35 underline-offset-4">打开 {binding.placeName} 地点社区</Link>
    </div>
  );
}
