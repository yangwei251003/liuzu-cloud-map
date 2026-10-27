"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { FavoriteItem } from "@/lib/portal/types";
import {
  BookmarkSimple,
  Trash,
  NavigationArrow,
  MapPin,
  Compass,
  ArrowRight,
} from "@phosphor-icons/react";

export default function TripPage() {
  const router = useRouter();
  const version = usePortalVersion();
  const favorites = useMemo(() => PortalDemoRepository.getFavorites(), [version]);

  const handleRemoveFavorite = (e: React.MouseEvent, fav: FavoriteItem) => {
    e.preventDefault();
    e.stopPropagation();
    PortalDemoRepository.toggleFavorite({
      entityType: fav.entityType,
      entityId: fav.entityId,
      title: fav.title,
      category: fav.category,
    });
  };

  const handleStartNav = (fav: FavoriteItem) => {
    PortalDemoRepository.recordMetricEvent({
      entityType: fav.entityType,
      entityId: fav.entityId,
      entityName: fav.title,
      eventType: "navigation_start",
    });
    router.push(`/map#nav-${fav.entityId}`);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              <BookmarkSimple size={26} className="text-rose-600" weight="fill" />
              <span>我的收藏与轻行程</span>
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              本地安全持久化保存的胜景与体验清单，随时一键调起导航出发
            </p>
          </div>

          <Link
            href="/explore"
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-colors"
          >
            + 去发现更多
          </Link>
        </div>

        {favorites.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 shadow-xs space-y-4">
            <BookmarkSimple size={48} className="text-stone-300 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-stone-800">暂无收藏内容</h2>
              <p className="text-xs text-stone-400 max-w-sm mx-auto">
                在探索地图或浏览体验活动时，点击“收藏”按钮，即可在此处随时查阅并规划行程。
              </p>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md transition-all"
            >
              <Compass size={16} />
              <span>去发现热门胜境与采茶活动</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-14 rounded-xl overflow-hidden bg-stone-100 shrink-0 border border-stone-200">
                    {fav.imageUrl ? (
                      <img src={fav.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">无图</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-stone-100 text-stone-700 text-[10px] px-2 py-0.5 rounded font-semibold">
                        {fav.category}
                      </span>
                      <h3 className="font-bold text-stone-900 text-base">{fav.title}</h3>
                    </div>
                    {fav.address && <p className="text-xs text-stone-500 line-clamp-1">{fav.address}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleStartNav(fav)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <NavigationArrow size={15} weight="bold" />
                    <span>出发导航</span>
                  </button>

                  <Link
                    href={fav.entityType === "activity" ? `/activity/${fav.entityId}` : `/place/${fav.entityId}`}
                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
                  >
                    详情
                  </Link>

                  <button
                    onClick={(e) => handleRemoveFavorite(e, fav)}
                    className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="移除收藏"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
