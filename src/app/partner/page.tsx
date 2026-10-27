"use client";

import React from "react";
import Link from "next/link";
import {
  MapPin,
  Sparkle,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Storefront,
  UsersThree,
  Plant,
  PaintBrush,
  Compass,
} from "@phosphor-icons/react";

export default function PartnerLandingPage() {
  const merchantTypes = [
    {
      title: "景区商户与餐饮",
      desc: "特色农家乐、山林茶舍、素斋餐馆、文创小店",
      icon: Storefront,
      color: "text-amber-600 bg-amber-50 border-amber-200",
    },
    {
      title: "农业合作社与茶园",
      desc: "生态茶园、果蔬采摘基地、特色农副产品展示中心",
      icon: Plant,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
    {
      title: "非遗工坊与手艺人",
      desc: "紫砂陶艺、古琴雅集、禅香制作、传统手工艺传习所",
      icon: PaintBrush,
      color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    },
    {
      title: "村集体与研学机构",
      desc: "美丽乡村文化广场、研学实践营地、民俗节庆组织方",
      icon: UsersThree,
      color: "text-sky-600 bg-sky-50 border-sky-200",
    },
  ];

  const steps = [
    {
      step: "01",
      title: "填写主体资料",
      desc: "简短介绍合作社/商户名称、主营类目与联系电话，建立诚信档案。",
    },
    {
      step: "02",
      title: "地图精确定位",
      desc: "在地图上直观选点落图，标注游客可见的准确到达导航位置。",
    },
    {
      step: "03",
      title: "发布特色体验与活动",
      desc: "填写采摘时间、茶艺流程、价格门票及联系方式，提交审核。",
    },
    {
      step: "04",
      title: "审核通过，即刻在游客端呈现",
      desc: "运营审核通过后，活动即时展示在游客地图与发现推荐流，直达客流。",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
      {/* Hero 区域 */}
      <div className="bg-linear-to-br from-amber-900/90 via-stone-900 to-emerald-950 text-white rounded-3xl p-8 sm:p-12 shadow-xl border border-amber-700/30 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-400/30">
            <Sparkle size={14} weight="fill" />
            <span>县域数字文旅扶持计划</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            让您的文旅资源，被每一位走进六祖镇的游客看见
          </h1>
          <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
            零入驻费、直连高德地图精准导航。无论是山间采茶、非遗陶艺，还是温泉体验，一键入驻即可获得平台审核落图与全网推介。
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-4">
            <Link
              href="/partner/workbench"
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 text-sm"
            >
              <span>进入演示工作台</span>
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link
              href="/partner/activities/new"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all border border-white/20 text-sm flex items-center gap-2"
            >
              <span>快速发布体验活动</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 支持入驻的主体 */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-stone-900">支持入驻的多元主体</h2>
          <p className="text-sm text-stone-500 max-w-xl mx-auto">
            我们面向新兴县域各类经营主体开放，让分散的乡村文旅明珠串成璀璨路线。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {merchantTypes.map((t, idx) => {
            const Icon = t.icon;
            return (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs hover:shadow-md transition-all space-y-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${t.color}`}>
                  <Icon size={22} weight="duotone" />
                </div>
                <h3 className="font-bold text-stone-900 text-base">{t.title}</h3>
                <p className="text-xs text-stone-500 leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 入驻 4 步流程 */}
      <div className="bg-white rounded-3xl p-8 border border-stone-200 shadow-xs space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-stone-900">极简 4 步入驻流程</h2>
          <p className="text-xs text-stone-500">透明化进度反馈，专属文旅运营团队 24 小时内审核完成。</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {steps.map((s, idx) => (
            <div key={idx} className="space-y-2 relative">
              <div className="text-2xl font-extrabold text-amber-600/30 font-mono">{s.step}</div>
              <h3 className="font-bold text-stone-900 text-sm">{s.title}</h3>
              <p className="text-xs text-stone-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 底部 CTA */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-stone-900 text-base">准备好将您的活动呈现在地图上了吗？</h3>
          <p className="text-xs text-stone-600 mt-0.5">演示账号已通过基础主体认证，您可以立即开始体验完整的发布与审核闭环。</p>
        </div>
        <Link
          href="/partner/workbench"
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-colors shrink-0 flex items-center gap-2"
        >
          <span>进入商户工作台</span>
          <ArrowRight size={15} weight="bold" />
        </Link>
      </div>
    </div>
  );
}
