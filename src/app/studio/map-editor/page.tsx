"use client";

import React, { useState, useMemo } from "react";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place, Activity } from "@/lib/portal/types";
import {
  MapTrifold,
  MapPin,
  CheckCircle,
  FloppyDisk,
  Crosshair,
  Compass,
} from "@phosphor-icons/react";

export default function StudioMapEditorPage() {
  const version = usePortalVersion();
  const places = useMemo(() => PortalDemoRepository.getPlaces(), [version]);
  const activities = useMemo(() => PortalDemoRepository.getActivities(), [version]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedItem = useMemo(() => {
    if (selectedKey) {
      const [type, id] = selectedKey.split(":");
      if (type === "place") {
        const p = places.find((x) => x.id === id);
        if (p) return { type: "place" as const, item: p };
      } else {
        const a = activities.find((x) => x.id === id);
        if (a) return { type: "activity" as const, item: a };
      }
    }
    return places.length > 0 ? { type: "place" as const, item: places[0] } : null;
  }, [places, activities, selectedKey]);

  const [latInput, setLatInput] = useState(22.5924);
  const [lngInput, setLngInput] = useState(112.2229);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSelectItem = (type: "place" | "activity", item: Place | Activity) => {
    setSelectedKey(`${type}:${item.id}`);
    setLatInput(item.latitude);
    setLngInput(item.longitude);
  };

  const handleSaveLocation = () => {
    if (!selectedItem) return;
    const gcj: [number, number] = [lngInput + 0.0051, latInput - 0.0029];

    if (selectedItem.type === "place") {
      PortalDemoRepository.savePlace({
        ...(selectedItem.item as Place),
        latitude: latInput,
        longitude: lngInput,
        gcj02: gcj,
      });
    } else {
      PortalDemoRepository.saveActivity({
        ...(selectedItem.item as Activity),
        latitude: latInput,
        longitude: lngInput,
        gcj02: gcj,
      });
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <MapTrifold size={26} className="text-indigo-600" />
            <span>地图点位落图校准台</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            选择地点或活动，微调高德/WGS84 经纬度坐标，实时生效于游客端导航与路网
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧点位选择 (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-xs p-4 space-y-4 max-h-[600px] overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold text-stone-700 uppercase">1. 实体地点点位</h3>
            <div className="mt-2 space-y-1">
              {places.map((p) => {
                const isSelected = selectedItem?.type === "place" && selectedItem.item.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectItem("place", p)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between transition-all ${
                      isSelected ? "bg-indigo-600 text-white font-bold" : "hover:bg-stone-50 text-stone-800"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className={`text-[10px] ${isSelected ? "text-indigo-200" : "text-stone-400"}`}>[{p.category}]</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-700 uppercase">2. 文旅体验活动点位</h3>
            <div className="mt-2 space-y-1">
              {activities.map((a) => {
                const isSelected = selectedItem?.type === "activity" && selectedItem.item.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => handleSelectItem("activity", a)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between transition-all ${
                      isSelected ? "bg-indigo-600 text-white font-bold" : "hover:bg-stone-50 text-stone-800"
                    }`}
                  >
                    <span className="line-clamp-1">{a.name}</span>
                    <span className={`text-[10px] ${isSelected ? "text-indigo-200" : "text-stone-400"}`}>活动</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧属性编辑与坐标确认 (8 cols) */}
        {selectedItem ? (
          <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 shadow-xs p-6 space-y-6">
            <div className="border-b border-stone-100 pb-3">
              <span className="text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">
                当前选中：{selectedItem.type === "place" ? "地点" : "体验活动"}
              </span>
              <h2 className="text-xl font-bold text-stone-900 mt-2">{selectedItem.item.name}</h2>
              <p className="text-xs text-stone-500 mt-0.5">{selectedItem.item.address}</p>
            </div>

            <div className="bg-stone-50 p-5 rounded-xl border border-stone-200 space-y-4">
              <h3 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Crosshair size={16} className="text-indigo-600" />
                <span>经纬度精确微调</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-stone-600 block mb-1">
                    纬度坐标 (Latitude)
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={latInput}
                    onChange={(e) => setLatInput(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-600 block mb-1">
                    经度坐标 (Longitude)
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={lngInput}
                    onChange={(e) => setLngInput(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs text-stone-500">预设快速定位：</span>
                {[
                  { name: "国恩寺周边", lat: 22.5924, lng: 112.2229 },
                  { name: "六祖故居周边", lat: 22.5941, lng: 112.2108 },
                  { name: "禅茶园基地", lat: 22.5882, lng: 112.2315 },
                  { name: "龙山温泉", lat: 22.5821, lng: 112.2176 },
                  { name: "禅域小镇", lat: 22.6428, lng: 112.2295 },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setLatInput(preset.lat);
                      setLngInput(preset.lng);
                    }}
                    className="px-2.5 py-1 bg-white border border-stone-300 hover:border-indigo-600 rounded-lg text-xs text-stone-700 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saveSuccess ? (
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle size={16} weight="fill" />
                  <span>坐标已保存并在游客端生效！</span>
                </span>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleSaveLocation}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                <FloppyDisk size={16} weight="bold" />
                <span>保存点位落图坐标</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
