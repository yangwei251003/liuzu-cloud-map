"use client";

import React, { useMemo } from "react";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place, Activity } from "@/lib/portal/types";
import {
  Sparkle,
  Star,
  CheckCircle,
  MapPin,
  CalendarCheck,
} from "@phosphor-icons/react";

export default function StudioFeaturedPage() {
  const version = usePortalVersion();
  const places = useMemo(() => PortalDemoRepository.getPlaces({ status: "published" }), [version]);
  const activities = useMemo(() => PortalDemoRepository.getActivities({ status: "published" }), [version]);

  const handleTogglePlaceFeatured = (p: Place) => {
    PortalDemoRepository.savePlace({
      ...p,
      featured: !p.featured,
    });
  };

  const handleToggleActivityFeatured = (a: Activity) => {
    PortalDemoRepository.saveActivity({
      ...a,
      featured: !a.featured,
    });
  };

  const featuredPlaces = places.filter((p) => p.featured);
  const featuredActivities = activities.filter((a) => a.featured);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          <Sparkle size={26} className="text-amber-500" weight="fill" />
          <span>首页与地图推荐位编排</span>
        </h1>
        <p className="text-xs text-stone-500 mt-1">
          设置哪些优质地点与特色体验活动在游客端首页轮播、地图优先气泡中高亮展示
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* 1. 地点推荐位 */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
              <MapPin size={18} className="text-emerald-600" />
              <span>地点推荐位 ({featuredPlaces.length} 处已设)</span>
            </h2>
          </div>

          <div className="space-y-2">
            {places.map((place) => (
              <div
                key={place.id}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                  place.featured ? "bg-amber-50/50 border-amber-300" : "bg-stone-50 border-stone-200"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {place.featured && <Star size={14} weight="fill" className="text-amber-500" />}
                    <span className="font-bold text-sm text-stone-900">{place.name}</span>
                    <span className="text-[10px] text-stone-400">[{place.category}]</span>
                  </div>
                  <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">{place.summary}</p>
                </div>

                <button
                  onClick={() => handleTogglePlaceFeatured(place)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                    place.featured
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-white border border-stone-300 text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {place.featured ? "已推荐" : "设为推荐"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2. 活动推荐位 */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
              <CalendarCheck size={18} className="text-indigo-600" />
              <span>活动体验推荐位 ({featuredActivities.length} 项已设)</span>
            </h2>
          </div>

          <div className="space-y-2">
            {activities.map((act) => (
              <div
                key={act.id}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                  act.featured ? "bg-amber-50/50 border-amber-300" : "bg-stone-50 border-stone-200"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {act.featured && <Star size={14} weight="fill" className="text-amber-500" />}
                    <span className="font-bold text-sm text-stone-900 line-clamp-1">{act.name}</span>
                  </div>
                  <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">{act.timeDescription}</p>
                </div>

                <button
                  onClick={() => handleToggleActivityFeatured(act)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                    act.featured
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-white border border-stone-300 text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {act.featured ? "已推荐" : "设为推荐"}
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
