"use client";

import { ArrowLeft, Camera, ChatsCircle, MapPin, SpinnerGap, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseFormalCommunityPreview, type FormalCommunityPreview } from "@/lib/formal-community-preview";

type ViewState =
  | { status: "LOADING"; preview: null }
  | { status: "READY"; preview: FormalCommunityPreview }
  | { status: "UNAVAILABLE"; preview: null };

export function FormalPlaceCommunityExperience({ placeId, scenicAreaId }: { placeId: string; scenicAreaId: string }) {
  const [state, setState] = useState<ViewState>({ status: "LOADING", preview: null });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        if (navigator.onLine === false) throw new Error("offline");
        const response = await fetch(`/api/v1/social/communities/${encodeURIComponent(placeId)}/posts?limit=3&scenicAreaId=${encodeURIComponent(scenicAreaId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("unavailable");
        const preview = parseFormalCommunityPreview(await response.json() as unknown, placeId, scenicAreaId);
        if (!preview) throw new Error("invalid");
        if (!controller.signal.aborted) setState({ status: "READY", preview });
      } catch {
        if (!controller.signal.aborted) setState({ status: "UNAVAILABLE", preview: null });
      }
    })();
    return () => controller.abort();
  }, [placeId, scenicAreaId]);

  return (
    <main className="min-h-screen bg-[#f3f6f1] px-4 py-10 text-[#173f35] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/guide" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/15 bg-white px-4 text-sm font-semibold"><ArrowLeft size={17} />返回现场导览</Link>
        <section className="mt-6 overflow-hidden rounded-[28px] border border-[#173f35]/12 bg-[#fffdf7] shadow-[0_22px_70px_rgba(23,63,53,0.09)]" aria-labelledby="formal-community-title">
          <header className="bg-[#173f35] px-6 py-8 text-white sm:px-8">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d6e4dc]"><MapPin size={16} weight="fill" />正式 POI 绑定社区</p>
            <h1 id="formal-community-title" className="mt-3 text-2xl font-semibold sm:text-3xl">{state.status === "READY" ? state.preview.placeName : "地点社区核验"}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d6e4dc]">这里只读取同一景区、当前正式发布且仍在有效期内的地点社区。游客内容经过审核，但不能证明当前开放、客流、道路安全或官方事实。</p>
          </header>

          {state.status === "LOADING" ? <div className="flex min-h-64 items-center justify-center gap-3 p-8 text-sm text-[#61716a]"><SpinnerGap className="animate-spin motion-reduce:animate-none" size={22} />正在核验正式社区…</div> : null}
          {state.status === "UNAVAILABLE" ? <div className="p-8 sm:p-10"><h2 className="text-xl font-semibold">当前没有可核验的正式社区</h2><p className="mt-3 text-sm leading-6 text-[#61716a]">可能是社区尚未发布、绑定的正式 POI 或发布版本已过期、服务端审核链未启用，或当前处于离线状态。系统不会用候选社区替代。</p></div> : null}
          {state.status === "READY" ? <div className="p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3" aria-label="过去 24 小时审核内容摘要">
              <div className="rounded-2xl bg-[#e7eee8] p-4"><ChatsCircle size={22} /><strong className="mt-3 block text-2xl">{state.preview.postCount}</strong><span className="text-xs text-[#61716a]">审核公开动态</span></div>
              <div className="rounded-2xl bg-[#f4eadc] p-4"><Camera size={22} /><strong className="mt-3 block text-2xl">{state.preview.photoCount}</strong><span className="text-xs text-[#61716a]">审核公开照片</span></div>
              <div className="rounded-2xl bg-[#edf0e8] p-4"><UsersThree size={22} /><strong className="mt-3 block text-2xl">{state.preview.checkInCount}</strong><span className="text-xs text-[#61716a]">公开打卡</span></div>
            </div>
            <h2 className="mt-8 text-lg font-semibold">最新审核动态</h2>
            {state.preview.posts.length ? <ol className="mt-4 grid gap-3">{state.preview.posts.map((post) => <li key={post.id} className="rounded-2xl border border-[#173f35]/10 bg-white p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{post.authorDisplayName}</strong><time className="text-xs text-[#718078]" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><p className="mt-2 text-sm leading-6 text-[#52655c]">{post.body}</p></li>)}</ol> : <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-[#61716a]">过去 24 小时没有可展示的审核动态。</p>}
            <p className="mt-6 text-xs leading-5 text-[#718078]">摘要生成于 {new Date(state.preview.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}；本页请求未包含游客当前位置。</p>
          </div> : null}
        </section>
      </div>
    </main>
  );
}
