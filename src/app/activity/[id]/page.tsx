"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Activity } from "@/lib/portal/types";
import {
  CalendarCheck,
  BookmarkSimple,
  NavigationArrow,
  Phone,
  Clock,
  CurrencyCny,
  ArrowLeft,
  UsersThree,
  MapPin,
  Storefront,
  Sparkle,
} from "@phosphor-icons/react";

export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const version = usePortalVersion();

  const act = useMemo(() => (id ? PortalDemoRepository.getActivityById(id) || null : null), [id, version]);
  const isFav = useMemo(() => (act ? PortalDemoRepository.isFavorite("activity", act.id) : false), [act, version]);
  const [activeImgIdx, setActiveImgIdx] = useState(0);

  useEffect(() => {
    if (id) {
      const a = PortalDemoRepository.getActivityById(id);
      if (a) {
        PortalDemoRepository.recordMetricEvent({
          entityType: "activity",
          entityId: a.id,
          entityName: a.name,
          organizationId: a.organizationId,
          eventType: "view",
        });
      }
    }
  }, [id]);

  if (!act) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4 font-sans">
        <CalendarCheck size={40} className="text-stone-300 mx-auto" />
        <h1 className="text-xl font-bold text-stone-700">体验活动未找到或尚未上线</h1>
        <Link href="/explore" className="text-xs text-amber-700 font-bold hover:underline">
          返回发现页
        </Link>
      </div>
    );
  }

  const handleToggleFavorite = () => {
    const favorited = PortalDemoRepository.toggleFavorite({
      entityType: "activity",
      entityId: act.id,
      title: act.name,
      category: act.category,
      imageUrl: act.images[0],
      address: act.address,
    });
  };

  const handleStartNavigation = () => {
    PortalDemoRepository.recordMetricEvent({
      entityType: "activity",
      entityId: act.id,
      entityName: act.name,
      organizationId: act.organizationId,
      eventType: "navigation_start",
    });
    router.push(`/map#nav-${act.id}`);
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
            <span>{isFav ? "已收藏" : "收藏体验"}</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <div className="bg-stone-900 rounded-3xl overflow-hidden shadow-md relative aspect-16/10">
          {act.images && act.images.length > 0 ? (
            <img
              src={act.images[activeImgIdx] || act.images[0]}
              alt={act.name}
              className="w-full h-full object-cover"
            />
          ) : null}

          <div className="absolute top-4 left-4 bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
            {act.category}
          </div>

          {act.images && act.images.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5 bg-stone-950/60 p-1.5 rounded-xl backdrop-blur-md">
              {act.images.map((_, idx) => (
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-semibold border border-amber-200 flex items-center gap-1">
                <Storefront size={13} /> {act.organizationName || "商户"}
              </span>
              {act.featured && (
                <span className="text-xs text-amber-900 bg-amber-200 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                  <Sparkle size={13} weight="fill" /> 推荐体验
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 leading-tight">
              {act.name}
            </h1>
            <p className="text-xs text-stone-500 leading-relaxed pt-1">
              {act.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/60">
              <CurrencyCny size={20} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-500 block">体验费用</span>
                <strong className="text-amber-800 text-sm font-bold">{act.priceText}</strong>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-stone-50 border border-stone-100">
              <Clock size={20} className="text-stone-700 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">开放体验时间</span>
                <span className="font-semibold text-stone-800">{act.timeDescription}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-stone-50 border border-stone-100">
              <Phone size={20} className="text-sky-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">预约方式与咨询电话</span>
                <span className="font-semibold text-stone-800">
                  {act.bookingMethod} · {act.contact}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-stone-50 border border-stone-100">
              <MapPin size={20} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-stone-400 block">活动举办地点</span>
                <span className="font-semibold text-stone-800">{act.address}</span>
              </div>
            </div>
          </div>

          {act.tags && act.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {act.tags.map((t) => (
                <span key={t} className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-stone-100">
            <h2 className="text-sm font-bold text-stone-900">详细体验流程与服务说明</h2>
            <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
              {act.description}
            </p>
          </div>

          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-stone-400">
              📍 地点坐标已校准落图 · 高德导航支持
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

