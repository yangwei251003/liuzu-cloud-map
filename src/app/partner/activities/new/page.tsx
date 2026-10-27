"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository } from "@/lib/portal/demo-repository";
import { Activity } from "@/lib/portal/types";
import {
  Sparkle,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  MapPin,
  CalendarCheck,
  Image as ImageIcon,
  CurrencyCny,
  Phone,
  Eye,
  Storefront,
} from "@phosphor-icons/react";

export default function NewActivityWizard() {
  const router = useRouter();
  const { user } = usePortalAuth();
  const orgId = user.organizationId || "org-liuzu-tea";
  const org = PortalDemoRepository.getOrganizationById(orgId);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "禅茶一味·秋季古法制茶与私享品茗体验",
    category: "文化体验" as const,
    summary: "在清晨薄雾中亲手采摘初秋生态茶，跟随老茶师学习柴火杀青，品味一盏高山甘露。",
    description: "本体验包含：1. 换装茶农斗笠与竹篓；2. 梯田茶园讲解与标准芽叶采摘；3. 体验柴火炒青与手揉工艺；4. 禅茶茶艺展示与三道茶品鉴；5. 赠送自制包装伴手茶一份（50g）。",
    address: "广东省云浮市新兴县六祖镇东山茶园基地体验中心",
    latitude: 22.5882,
    longitude: 112.2315,
    gcj02: [112.2366, 22.5853] as [number, number],
    timeDescription: "每天上午 09:00 - 11:30，下午 14:30 - 17:00 两场可选",
    startAt: "2026-08-20T09:00:00Z",
    endAt: "2026-10-31T17:00:00Z",
    priceText: "￥68 / 人（含茶具、茶叶及伴手礼）",
    capacity: 20,
    bookingMethod: "电话预约" as const,
    contact: "",
    images: [
      "/景区宣传专区图片视频素材/国恩寺 (5).jpg",
      "/景区宣传专区图片视频素材/云浮市禅域小镇 (4).jpg",
    ],
    tags: ["非遗手作", "文化体验", "亲子互动", "农旅融合"],
  });

  const availablePhotos = [
    "/景区宣传专区图片视频素材/国恩寺 (5).jpg",
    "/景区宣传专区图片视频素材/云浮市禅域小镇 (4).jpg",
    "/景区宣传专区图片视频素材/六祖慧能故居 (3).jpg",
    "/景区宣传专区图片视频素材/云浮市龙山温泉 (2).jpg",
    "/景区宣传专区图片视频素材/国恩寺 (4).jpg",
  ];

  const presetLocations = [
    { name: "六祖东山茶园生态基地", address: "六祖镇东山生态示范区", lat: 22.5882, lng: 112.2315, gcj: [112.2366, 22.5853] },
    { name: "国恩寺东侧文化广场", address: "六祖镇六祖故里旅游区", lat: 22.5924, lng: 112.2229, gcj: [112.228, 22.5896] },
    { name: "禅域小镇非遗体验坊", address: "六祖镇六祖大道西侧", lat: 22.6428, lng: 112.2295, gcj: [112.2347, 22.6399] },
    { name: "龙山温泉禅意养生区", address: "六祖镇龙山脚下", lat: 22.5821, lng: 112.2176, gcj: [112.2228, 22.5792] },
  ];

  const handleSelectPresetLocation = (loc: typeof presetLocations[0]) => {
    setFormData((prev) => ({
      ...prev,
      address: loc.address,
      latitude: loc.lat,
      longitude: loc.lng,
      gcj02: loc.gcj as [number, number],
    }));
  };

  const handleTogglePhoto = (photo: string) => {
    setFormData((prev) => {
      const exists = prev.images.includes(photo);
      return {
        ...prev,
        images: exists ? prev.images.filter((img) => img !== photo) : [...prev.images, photo],
      };
    });
  };

  const handleToggleTag = (tag: string) => {
    setFormData((prev) => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const activityId = `act-${Date.now()}`;
    const newActivity: Activity = {
      id: activityId,
      organizationId: orgId,
      organizationName: org?.name || "六祖镇禅茶生态种植合作社",
      name: formData.name,
      category: formData.category,
      summary: formData.summary,
      description: formData.description,
      startAt: formData.startAt,
      endAt: formData.endAt,
      timeDescription: formData.timeDescription,
      priceText: formData.priceText,
      capacity: formData.capacity,
      bookingMethod: formData.bookingMethod,
      contact: formData.contact,
      address: formData.address,
      latitude: formData.latitude,
      longitude: formData.longitude,
      gcj02: formData.gcj02,
      images: formData.images.length > 0 ? formData.images : ["/景区宣传专区图片视频素材/国恩寺 (5).jpg"],
      tags: formData.tags,
      status: "pending_review",
      featured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    PortalDemoRepository.createSubmission({
      entityType: "activity",
      entity: newActivity,
      organizationId: orgId,
      organizationName: org?.name || "六祖镇禅茶生态种植合作社",
      submittedBy: user.name,
      note: "商户提交秋季体验活动，申请在云游地图审核上线",
    });

    router.push("/partner/submissions");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      
      {/* 顶部标题与步骤指示器 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/partner/workbench"
            className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 font-medium"
          >
            <ArrowLeft size={14} />
            <span>返回商户工作台</span>
          </Link>
          <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            第 {step} / 4 步
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-stone-900">发布文旅体验活动</h1>
          <p className="text-xs text-stone-500 mt-1">分步填写体验项目详情，审核通过后即刻展示在游客端地图与发现流中</p>
        </div>

        {/* 步骤条 */}
        <div className="grid grid-cols-4 gap-2">
          {["1. 基础信息", "2. 地图定位", "3. 经营时间与门票", "4. 预览并提交"].map((title, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                step >= idx + 1 ? "bg-amber-600" : "bg-stone-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* 表单卡片 */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-xs space-y-6">
        
        {/* Step 1: 基础信息 */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-stone-900 border-b border-stone-100 pb-3 flex items-center gap-2">
              <CalendarCheck size={18} className="text-amber-600" />
              <span>步骤 1：体验项目基本信息</span>
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">
                体验项目名称 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white transition-all font-medium"
                placeholder="例如：禅茶一味·秋季制茶与品茗体验"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  体验类目 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as typeof formData.category })}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                >
                  <option value="文化体验">文化体验</option>
                  <option value="农旅采摘">农旅采摘</option>
                  <option value="非遗手作">非遗手作</option>
                  <option value="研学讲座">研学讲座</option>
                  <option value="节庆民俗">节庆民俗</option>
                  <option value="休闲康养">休闲康养</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  所属主体 / 合作社
                </label>
                <input
                  type="text"
                  disabled
                  value={org?.name || "六祖镇禅茶生态种植合作社"}
                  className="w-full px-3.5 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm text-stone-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">
                一句话亮点摘要 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                placeholder="简明扼要展示在地图卡片上的核心吸引点"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">
                详细游玩与体验流程说明
              </label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                placeholder="详细说明包含哪些环节、提供哪些用具、是否赠送伴手礼等"
              />
            </div>
          </div>
        )}

        {/* Step 2: 地图定位 */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-stone-900 border-b border-stone-100 pb-3 flex items-center gap-2">
              <MapPin size={18} className="text-amber-600" />
              <span>步骤 2：地图精准选点与落图位置</span>
            </h2>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 block">
                快捷选择周边核心文旅点位坐标：
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presetLocations.map((loc, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => handleSelectPresetLocation(loc)}
                    className={`p-3 text-left rounded-xl border transition-all text-xs ${
                      formData.address === loc.address
                        ? "border-amber-600 bg-amber-50 text-amber-900 font-semibold"
                        : "border-stone-200 bg-stone-50/50 hover:bg-stone-100 text-stone-700"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <MapPin size={14} className="text-amber-600" />
                      <span>{loc.name}</span>
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">{loc.address}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">
                详细到达地址说明 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                placeholder="例如：广东省云浮市新兴县六祖镇东山茶园基地"
              />
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-stone-700">当前地图坐标拾取值：</span>
                <div className="text-stone-500 font-mono mt-0.5">
                  经度: {formData.longitude.toFixed(5)} · 纬度: {formData.latitude.toFixed(5)} (GCJ-02: {formData.gcj02[0].toFixed(5)}, {formData.gcj02[1].toFixed(5)})
                </div>
              </div>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-semibold border border-emerald-200 shrink-0">
                ✓ 坐标校验有效
              </span>
            </div>
          </div>
        )}

        {/* Step 3: 经营时间、门票与照片 */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-stone-900 border-b border-stone-100 pb-3 flex items-center gap-2">
              <CurrencyCny size={18} className="text-amber-600" />
              <span>步骤 3：经营时间、费用与实景照片</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  费用 / 门票说明 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.priceText}
                  onChange={(e) => setFormData({ ...formData, priceText: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                  placeholder="例如：￥68/人（含茶具茶叶）或 免费入园"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  预约方式 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.bookingMethod}
                  onChange={(e) => setFormData({ ...formData, bookingMethod: e.target.value as typeof formData.bookingMethod })}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                >
                  <option value="电话预约">电话预约</option>
                  <option value="无需预约">无需预约（随到随学）</option>
                  <option value="现场登记">现场登记</option>
                  <option value="线上预约">线上预约</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  开放时间说明 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.timeDescription}
                  onChange={(e) => setFormData({ ...formData, timeDescription: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                  placeholder="例如：每天 09:00 - 17:00"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  咨询与预约联系电话 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-hidden focus:border-amber-600 focus:bg-white"
                  placeholder="例如：示例联系人（不填写真实手机号）"
                />
              </div>
            </div>

            {/* 实景照片选择 */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-stone-700 block">
                选择实景照片（点击多选）：
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {availablePhotos.map((photo, idx) => {
                  const isSelected = formData.images.includes(photo);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleTogglePhoto(photo)}
                      className={`relative aspect-4/3 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                        isSelected ? "border-amber-600 shadow-md ring-2 ring-amber-400/40" : "border-stone-200 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                      {isSelected ? (
                        <div className="absolute top-1 right-1 bg-amber-600 text-white rounded-full p-0.5 shadow-xs">
                          <CheckCircle size={14} weight="fill" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 特色标签 */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-stone-700 block">
                特色标签（点击选择）：
              </label>
              <div className="flex flex-wrap gap-2">
                {["非遗手作", "文化体验", "亲子互动", "农旅融合", "古法制茶", "茶艺品鉴", "拍照出片"].map((tag) => {
                  const active = formData.tags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => handleToggleTag(tag)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        active ? "bg-amber-600 text-white shadow-xs" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: 提交前预览 */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-base font-bold text-stone-900 border-b border-stone-100 pb-3 flex items-center gap-2">
              <Eye size={18} className="text-amber-600" />
              <span>步骤 4：游客端卡片实时效果预览</span>
            </h2>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex items-center gap-2">
                <span className="bg-amber-600 text-white text-[11px] font-bold px-2 py-0.5 rounded">
                  {formData.category}
                </span>
                <span className="text-xs text-stone-500">{org?.name}</span>
              </div>
              <h3 className="text-lg font-bold text-stone-900">{formData.name}</h3>
              <p className="text-xs text-stone-600 leading-relaxed">{formData.summary}</p>
              
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {formData.tags.map((t) => (
                  <span key={t} className="bg-stone-200/80 text-stone-700 text-[10px] px-2 py-0.5 rounded-md font-medium">
                    #{t}
                  </span>
                ))}
              </div>

              <div className="border-t border-stone-200 pt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
                <div>💰 费用：<strong className="text-stone-900">{formData.priceText}</strong></div>
                <div>🕒 时间：<span className="text-stone-900">{formData.timeDescription}</span></div>
                <div>📍 地址：<span className="text-stone-900">{formData.address}</span></div>
                <div>📞 预约：<span className="text-stone-900">{formData.contact}</span></div>
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <p className="font-bold flex items-center gap-1">
                <Sparkle size={14} weight="fill" />
                <span>确认提交至 Studio 运营审核</span>
              </p>
              <p className="mt-1 text-amber-800">
                提交后工单将进入“待审核”队列。您可以随时在“审核进度”中查看运营审批动态。
              </p>
            </div>
          </div>
        )}

        {/* 底部前后步骤控制按钮 */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-sm rounded-xl transition-all flex items-center gap-1.5"
            >
              <ArrowLeft size={16} />
              <span>上一步</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-xl transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>下一步</span>
              <ArrowRight size={16} weight="bold" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <CheckCircle size={18} weight="fill" />
              <span>确认提交审核</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
}

