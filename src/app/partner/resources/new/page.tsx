"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository } from "@/lib/portal/demo-repository";
import { Place } from "@/lib/portal/types";
import {
  Sparkle,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Storefront,
} from "@phosphor-icons/react";

export default function NewPlaceWizard() {
  const router = useRouter();
  const { user } = usePortalAuth();
  const orgId = user.organizationId || "org-liuzu-tea";
  const org = PortalDemoRepository.getOrganizationById(orgId);

  const [formData, setFormData] = useState({
    name: "六祖东山高山禅茶观光基地",
    subtitle: "梯田茶海与茶道古法展示馆",
    category: "在地体验" as const,
    summary: "海拔500米高山生态茶园，常年云雾缭绕，提供全套制茶研学设施。",
    description: "占地两百亩，集有机茶树繁育、古树茶认养、禅茶文化陈列馆与品茗茶寮于一体。",
    address: "广东省云浮市新兴县六祖镇东山茶园基地",
    latitude: 22.5882,
    longitude: 112.2315,
    gcj02: [112.2366, 22.5853] as [number, number],
    openingHours: "08:30 - 18:00",
    priceText: "免费参观，特色体验单计",
    contact: "",
    serviceTags: ["停车场", "卫生间", "茶艺品鉴", "亲子采摘"],
    images: ["/景区宣传专区图片视频素材/国恩寺 (4).jpg"],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const placeId = `place-${Date.now()}`;
    const newPlace: Place = {
      id: placeId,
      organizationId: orgId,
      name: formData.name,
      subtitle: formData.subtitle,
      category: formData.category,
      summary: formData.summary,
      description: formData.description,
      address: formData.address,
      latitude: formData.latitude,
      longitude: formData.longitude,
      gcj02: formData.gcj02,
      images: formData.images,
      openingHours: formData.openingHours,
      priceText: formData.priceText,
      contact: formData.contact,
      serviceTags: formData.serviceTags,
      status: "pending_review",
      featured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    PortalDemoRepository.createSubmission({
      entityType: "place",
      entity: newPlace,
      organizationId: orgId,
      organizationName: org?.name || "六祖镇禅茶生态种植合作社",
      submittedBy: user.name,
      note: "登记新茶园基地实体地点",
    });

    router.push("/partner/submissions");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/partner/workbench"
          className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 font-medium"
        >
          <ArrowLeft size={14} />
          <span>返回工作台</span>
        </Link>
        <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
          地点登记
        </span>
      </div>

      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-5">
        <div>
          <h1 className="text-xl font-bold text-stone-900">登记新基地 / 实体门店</h1>
          <p className="text-xs text-stone-500 mt-1">提交实体点位坐标与设施服务，审核通过后将正式落图展示在游客端地图。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 block">地点名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:border-amber-600 focus:bg-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">分类</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as typeof formData.category })}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm"
              >
                <option value="在地体验">在地体验</option>
                <option value="文化">文化</option>
                <option value="休闲">休闲</option>
                <option value="餐饮">餐饮</option>
                <option value="非遗">非遗</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">开放营业时间</label>
              <input
                type="text"
                value={formData.openingHours}
                onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 block">详细地址</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 block">简介摘要</label>
            <textarea
              rows={3}
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm"
            />
          </div>

          <div className="pt-4 border-t border-stone-100 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <CheckCircle size={17} weight="fill" />
              <span>提交地点审核</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
