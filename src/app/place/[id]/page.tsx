"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place } from "@/lib/portal/types";
import {
  MapPin,
  BookmarkSimple,
  NavigationArrow,
  Phone,
  Clock,
  CurrencyCny,
  ArrowLeft,
} from "@phosphor-icons/react";

export default function PlaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const version = usePortalVersion();

  const place = useMemo(() => (id ? PortalDemoRepository.getPlaceById(id) || null : null), [id, version]);
  const isFav = useMemo(() => (place ? PortalDemoRepository.isFavorite("place", place.id) : false), [place, version]);
  const [activeImgIdx, setActiveImgIdx] = useState(0);

  useEffect(() => {
    if (id) {
      const p = PortalDemoRepository.getPlaceById(id);
      if (p) {
        PortalDemoRepository.recordMetricEvent({
          entityType: "place",
          entityId: p.id,
          entityName: p.name,
          organizationId: p.organizationId,
          eventType: "view",
        });
      }
    }
  }, [id]);

  if (!place) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4 font-sans">
        <MapPin size={40} className="text-stone-300 mx-auto" />
        <h1 className="text-xl font-bold text-stone-700">地点未找到或尚未发布</h1>
        <Link href="/explore" className="text-xs text-amber-700 font-bold hover:underline">
          返回发现页
        </Link>
      </div>
    );
  }

  const handleToggleFavorite = () => {
    const favorited = PortalDemoRepository.toggleFavorite({
      entityType: "place",
      entityId: place.id,
      title: place.name,
      category: place.category,
      imageUrl: place.images[0],
      address: place.address,
    });
  };

  const handleStartNavigation = () => {
    PortalDemoRepository.recordMetricEvent({
      entityType: "place",
      entityId: place.id,
      entityName: place.name,
      organizationId: place.organizationId,
      eventType: "navigation_start",
    });
    router.push(`/map#nav-${place.id}`);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft size={16} />
          <span>返回</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleFavorite}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isFav
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-white border-stone-200 text-stone-700 hover:bg-stone-100"
            }`}
          >
            <BookmarkSimple size={16} weight={isFav ? "fill" : "regular"} className={isFav ? "text-rose-600" : ""} />
            <span>{isFav ? "已收藏" : "收藏地点"}</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <div className="bg-stone-900 rounded-3xl overflow-hidden shadow-md relative aspect-16/10">
          {place.images && place.images.length > 0 ? (
            <img
              src={place.images[activeImgIdx] || place.images[0]}
              alt={place.name}
              className="w-full h-full object-cover"
            />
          ) : null}

          <div className="absolute top-4 left-4 bg-stone-900/80 text-white text-xs font-bold px-3 py-1 rounded-full backdrop-blur-md">
            {place.category}
          </div>

          {place.images && place.images.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5 bg-stone-950/60 p-1.5 rounded-xl backdrop-blur-md">
              {place.images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImgIdx(idx)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    activeImgIdx === idx ? "bg-amber-400 w-6" : "bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-6">
          <div className="space-y-2 border-b border-stone-100 pb-5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
              {place.name}
            </h1>
            {place.subtitle && (
              <p className="text-sm font-medium text-amber-800">{place.subtitle}</p>
            )}
            <p className="text-xs text-stone-500 leading-relaxed pt-1">
              {place.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-100">
              <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">开放时间</span>
                <span className="font-semibold text-stone-800">{place.openingHours}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-100">
              <CurrencyCny size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">门票与费用</span>
                <span className="font-semibold text-stone-800">{place.priceText}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-100">
              <MapPin size={18} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">详细地址</span>
                <span className="font-semibold text-stone-800">{place.address}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-100">
              <Phone size={18} className="text-sky-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">咨询联系方式</span>
                <span className="font-semibold text-stone-800">{place.contact}</span>
              </div>
            </div>
          </div>

          {place.serviceTags && place.serviceTags.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-stone-700 block">配套服务与设施：</span>
              <div className="flex flex-wrap gap-2">
                {place.serviceTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-medium"
                  >
                    ✓ {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-stone-100">
            <h2 className="text-sm font-bold text-stone-900">详细文化与游玩介绍</h2>
            <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
              {place.description}
            </p>
          </div>

          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-stone-400">
              📍 坐标已校准：{place.longitude.toFixed(4)}, {place.latitude.toFixed(4)}
            </div>

            <button
              onClick={handleStartNavigation}
              className="w-full sm:w-auto px-8 py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <NavigationArrow size={18} weight="bold" />
              <span>调起高德地图出发导航</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

