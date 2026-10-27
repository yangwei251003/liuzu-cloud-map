"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place, Activity } from "@/lib/portal/types";
import {
  Compass,
  MapPin,
  CalendarCheck,
  BookmarkSimple,
  NavigationArrow,
  MagnifyingGlass,
  Sparkle,
  Star,
  ArrowRight,
} from "@phosphor-icons/react";

export default function ExplorePage() {
  const router = useRouter();
  const version = usePortalVersion();
  const places = useMemo(() => PortalDemoRepository.getPlaces({ status: "published" }), [version]);
  const activities = useMemo(() => PortalDemoRepository.getActivities({ status: "published" }), [version]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCat, setSelectedCat] = useState("全部");

  const handleToggleFavPlace = (e: React.MouseEvent, p: Place) => {
    e.preventDefault();
    e.stopPropagation();
    PortalDemoRepository.toggleFavorite({
      entityType: "place",
      entityId: p.id,
      title: p.name,
      category: p.category,
      imageUrl: p.images[0],
      address: p.address,
    });
  };

  const handleToggleFavAct = (e: React.MouseEvent, a: Activity) => {
    e.preventDefault();
    e.stopPropagation();
    PortalDemoRepository.toggleFavorite({
      entityType: "activity",
      entityId: a.id,
      title: a.name,
      category: a.category,
      imageUrl: a.images[0],
      address: a.address,
    });
  };

  const handleStartNav = (e: React.MouseEvent, title: string, id: string, type: "place" | "activity") => {
    e.preventDefault();
    e.stopPropagation();
    PortalDemoRepository.recordMetricEvent({
      entityType: type,
      entityId: id,
      entityName: title,
      eventType: "navigation_start",
    });
    router.push(`/map#nav-${id}`);
  };

  const filteredPlaces = places.filter((p) => {
    const matchCat = selectedCat === "全部" || p.category === selectedCat;
    const matchQuery = !searchQuery || p.name.includes(searchQuery) || p.summary.includes(searchQuery);
    return matchCat && matchQuery;
  });

  const filteredActivities = activities.filter((a) => {
    const matchCat = selectedCat === "全部" || a.category === selectedCat || selectedCat === "特色体验";
    const matchQuery = !searchQuery || a.name.includes(searchQuery) || a.summary.includes(searchQuery);
    return matchCat && matchQuery;
  });

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20 font-sans">
      
      {/* 顶部搜索与定位 Banner */}
      <div className="bg-linear-to-b from-stone-900 via-stone-900 to-emerald-950 text-white pt-10 pb-8 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-amber-400 font-semibold tracking-wider uppercase">
                六祖故里 · 文旅发现
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                发现新兴在地体验与胜境
              </h1>
            </div>
            <Link
              href="/map"
              className="px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl border border-emerald-400/40 flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Compass size={16} weight="fill" />
              <span>打开全景地图</span>
            </Link>
          </div>

          {/* 搜索框 */}
          <div className="relative max-w-xl">
            <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索古刹、茶园采摘、温泉、陶艺手作..."
              className="w-full pl-10 pr-4 py-3 bg-stone-800/80 border border-stone-700/80 rounded-2xl text-sm text-white placeholder-stone-400 focus:outline-hidden focus:border-amber-400 focus:bg-stone-800 transition-all"
            />
          </div>

          {/* 分类快捷标签 */}
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 scrollbar-none">
            {["全部", "文化", "特色体验", "休闲", "山水", "在地体验"].map((cat) => {
              const active = selectedCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                    active
                      ? "bg-amber-400 text-stone-950 shadow-md font-bold"
                      : "bg-stone-800/80 text-stone-300 hover:bg-stone-700 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        
        {/* 当季热门文旅体验 (Activities) */}
        {filteredActivities.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkle size={20} className="text-amber-600" weight="fill" />
                <h2 className="text-lg font-bold text-stone-900">当季精选在地体验</h2>
              </div>
              <span className="text-xs text-stone-400">{filteredActivities.length} 项可参与</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {filteredActivities.map((act) => {
                const isFav = PortalDemoRepository.isFavorite("activity", act.id);
                return (
                  <Link
                    key={act.id}
                    href={`/activity/${act.id}`}
                    className="bg-white rounded-2xl border border-stone-200 shadow-xs hover:shadow-lg transition-all overflow-hidden flex flex-col justify-between group"
                  >
                    <div>
                      <div className="relative aspect-16/9 overflow-hidden bg-stone-100">
                        {act.images && act.images[0] ? (
                          <img
                            src={act.images[0]}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : null}
                        <div className="absolute top-2.5 left-2.5 bg-stone-900/80 text-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-xs">
                          {act.category}
                        </div>
                        <button
                          onClick={(e) => handleToggleFavAct(e, act)}
                          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 text-stone-700 hover:text-rose-600 flex items-center justify-center backdrop-blur-xs shadow-sm transition-colors"
                          title="收藏活动"
                        >
                          <BookmarkSimple size={16} weight={isFav ? "fill" : "regular"} className={isFav ? "text-rose-600" : ""} />
                        </button>
                      </div>

                      <div className="p-4 space-y-2">
                        <h3 className="font-bold text-stone-900 text-base group-hover:text-amber-700 transition-colors leading-snug">
                          {act.name}
                        </h3>
                        <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                          {act.summary}
                        </p>
                        
                        <div className="flex items-center gap-3 text-[11px] text-stone-400 pt-1">
                          <span>🕒 {act.timeDescription}</span>
                          <span>📞 {act.bookingMethod}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-0 border-t border-stone-100 mt-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-stone-400 block">体验价格</span>
                        <strong className="text-amber-700 font-bold text-sm">{act.priceText}</strong>
                      </div>

                      <button
                        onClick={(e) => handleStartNav(e, act.name, act.id, "activity")}
                        className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-1 transition-all shadow-xs"
                      >
                        <NavigationArrow size={14} weight="bold" />
                        <span>出发导航</span>
                      </button>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* 核心景点与文化地标 (Places) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={20} className="text-emerald-700" weight="fill" />
              <h2 className="text-lg font-bold text-stone-900">景点胜地与特色基地</h2>
            </div>
            <span className="text-xs text-stone-400">{filteredPlaces.length} 处地点</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPlaces.map((place) => {
              const isFav = PortalDemoRepository.isFavorite("place", place.id);
              return (
                <Link
                  key={place.id}
                  href={`/place/${place.id}`}
                  className="bg-white rounded-2xl border border-stone-200 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group"
                >
                  <div>
                    <div className="relative aspect-16/10 overflow-hidden bg-stone-100">
                      {place.images && place.images[0] ? (
                        <img
                          src={place.images[0]}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : null}
                      <div className="absolute top-2.5 left-2.5 bg-stone-900/80 text-emerald-300 text-[11px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs">
                        {place.category}
                      </div>
                      <button
                        onClick={(e) => handleToggleFavPlace(e, place)}
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 text-stone-700 hover:text-rose-600 flex items-center justify-center backdrop-blur-xs shadow-sm transition-colors"
                        title="收藏地点"
                      >
                        <BookmarkSimple size={16} weight={isFav ? "fill" : "regular"} className={isFav ? "text-rose-600" : ""} />
                      </button>
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="font-bold text-stone-900 text-base group-hover:text-emerald-800 transition-colors">
                        {place.name}
                      </h3>
                      <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                        {place.summary}
                      </p>
                      
                      <div className="text-[11px] text-stone-400 line-clamp-1">
                        📍 {place.address}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-stone-500 font-medium">{place.priceText}</span>
                    <button
                      onClick={(e) => handleStartNav(e, place.name, place.id, "place")}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-semibold flex items-center gap-1 transition-all"
                    >
                      <NavigationArrow size={13} weight="bold" />
                      <span>去这里</span>
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
