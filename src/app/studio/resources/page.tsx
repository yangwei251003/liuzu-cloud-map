"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place } from "@/lib/portal/types";
import { getStatusBadge } from "@/lib/portal/content-status-machine";
import {
  MapPin,
  PlusCircle,
  Eye,
  CheckCircle,
  XCircle,
  Sparkle,
} from "@phosphor-icons/react";

export default function StudioResourcesPage() {
  const version = usePortalVersion();
  const places = useMemo(() => PortalDemoRepository.getPlaces(), [version]);
  const [filterCategory, setFilterCategory] = useState("全部");

  const handleToggleStatus = (place: Place) => {
    const newStatus = place.status === "published" ? "unpublished" : "published";
    PortalDemoRepository.savePlace({
      ...place,
      status: newStatus,
    });
  };

  const handleToggleFeatured = (place: Place) => {
    PortalDemoRepository.savePlace({
      ...place,
      featured: !place.featured,
    });
  };

  const filteredPlaces = places.filter((p) => {
    if (filterCategory === "全部") return true;
    return p.category === filterCategory;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <MapPin size={26} className="text-emerald-600" />
            <span>全域地点与资源台账</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">管理景区、故居、茶园、温泉等所有实体空间点位的上下架与推荐属性</p>
        </div>

        <div className="flex items-center gap-2">
          {["全部", "文化", "山水", "休闲", "在地体验"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterCategory === cat ? "bg-emerald-700 text-white shadow-xs" : "bg-stone-200 text-stone-700 hover:bg-stone-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 列表表格 */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="divide-y divide-stone-100">
          {filteredPlaces.map((p) => {
            const badge = getStatusBadge(p.status);
            return (
              <div key={p.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0 border border-stone-200 bg-stone-100">
                    {p.images && p.images[0] ? (
                      <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400 text-[10px]">无图</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-semibold text-stone-400">[{p.category}]</span>
                      <h3 className="font-bold text-stone-900 text-base">{p.name}</h3>
                      {p.featured && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-bold">
                          推荐位
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 line-clamp-1">{p.address}</p>
                    <div className="text-[11px] text-stone-400">
                      经纬度: {p.longitude.toFixed(4)}, {p.latitude.toFixed(4)} · 营业时间: {p.openingHours}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleFeatured(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      p.featured ? "bg-amber-50 text-amber-800 border border-amber-300" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {p.featured ? "取消推荐" : "设为推荐"}
                  </button>

                  <button
                    onClick={() => handleToggleStatus(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      p.status === "published"
                        ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    }`}
                  >
                    {p.status === "published" ? "下架" : "上架发布"}
                  </button>

                  <Link
                    href={`/place/${p.id}`}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium"
                  >
                    预览
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
