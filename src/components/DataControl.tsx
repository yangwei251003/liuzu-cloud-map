"use client";

import { ArrowSquareOut, Check, ImageSquare, Trash, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { SectionHeader } from "./PageShell";
import { ACCESSIBILITY_PREFERENCES_KEY, PROJECT_DATA_CLEARED_EVENT } from "@/lib/accessibility-preferences";
import { clearProjectCaches, clearProjectStorage } from "@/lib/data-control";

export function DataControl() {
  const [message, setMessage] = useState("");
  const [clearing, setClearing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function clearProjectData() {
    setClearing(true);
    setMessage("");
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    const localResult = clearProjectStorage(storage);
    const cacheResult = await clearProjectCaches("caches" in window ? window.caches : null);
    if (localResult.removed.includes(ACCESSIBILITY_PREFERENCES_KEY)) window.dispatchEvent(new Event(PROJECT_DATA_CLEARED_EVENT));
    const failures = localResult.failed.length + cacheResult.failed.length;
    if (failures > 0 || !localResult.supported) {
      setMessage(`清除未完全成功：仍有 ${failures || 1} 项被浏览器阻止。页面没有声称已删除；请在浏览器站点设置中清除本网站数据。`);
    } else {
      const cacheNote = cacheResult.supported ? "核心离线缓存也已清除" : "当前浏览器不提供缓存清除接口";
      setMessage(`这台设备上的计划、导览进度、云游进度、知识卡、打卡、游记草稿、分享管理索引、纠错与运营演示数据已清除；${cacheNote}。游客账号会话与服务端分享没有被冒充删除：请先在“我的旅程”远程撤销服务端链接，并到“游客账号”单独退出。`);
    }
    setConfirming(false);
    setClearing(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-18">
      <SectionHeader
        level={1}
        meta="Privacy & control"
        title="你的数据，由你决定"
        description="当前版本默认匿名使用。行程、云游进度、知识卡、打卡、游记草稿与主动提交的纠错只保存在这台设备的浏览器中；可按需登录游客账号创建跨设备只读分享，但登录不会自动上传这些本地内容，也不会默认上传连续位置轨迹或把游客内容写入文化知识库。"
      />
      <div className="mt-8 divide-y divide-[#173f35]/10 border-y border-[#173f35]/10">
        {["前台连续定位默认关闭；只有你在进行中的演示导览里手动开启后才读取，暂停、结束或页面离开前台会立即停止，坐标与精度不会写入导览会话记录", "演示导览只在本机保存路线标识、当前站、暂停/终态与修订号，用于刷新恢复", "语音讲解使用浏览器朗读，不持续监听麦克风；云游朗读也必须由你主动触发", "AI 问答与游记提取默认都在本地；只有你为下一次操作单独勾选同意后，才会把当次问题或全文交给已配置的 Gemini 服务辅助整理，发送后授权自动复位", "知识卡只保存问题与来源引用，不保存 AI 回答全文；再次使用前需要重新核对", "游客账号只保存账号名、单向口令摘要、安全会话与防滥用记录；口令不会写入浏览器存储，会话令牌位于页面脚本不可读的 HttpOnly Cookie", "路线分享只包含预览中列出的最小字段，默认 7 天；已登录创建的服务端链接可跨设备读取和远程撤销，匿名本机演示链接无法远程收回"].map((item) => <div key={item} className="flex gap-3 py-4 text-sm leading-6"><Check className="mt-0.5 shrink-0 text-[#5d7d65]" size={18} weight="bold" />{item}</div>)}
      </div>
      <section className="mt-10 rounded-[2rem] border border-[#d95a4a]/18 bg-[#fff6ed] p-6"><div className="flex items-center gap-2 font-semibold text-[#8d493e]"><Warning size={20} weight="duotone" />清除本机数据</div><p className="mt-3 text-sm leading-6 text-[#634f49]">此操作会删除本项目在当前浏览器保存的计划、导览与云游进度、知识卡、打卡、游记草稿、分享管理索引和游客纠错，重置本机运营演示数据，并清除可识别的六祖云游离线缓存，无法撤销。它不会退出游客账号，也不会撤销服务端或已发送的本机演示链接；请先在分享区远程撤销需要收回的服务端链接。</p>{confirming ? <div className="mt-5 rounded-2xl border border-[#9b453c]/35 bg-white/65 p-4" role="alert"><p className="font-semibold text-[#7d332d]">请再次确认：删除后无法恢复</p><p className="mt-2 text-sm leading-6 text-[#634f49]">若还有需要保留的游记或路线，请先返回“我的旅程”导出；需要收回的服务端链接也请先远程撤销。</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void clearProjectData()} disabled={clearing} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#8b302a] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-55"><Trash size={17} />{clearing ? "正在清除并核对" : "确认永久删除"}</button><button type="button" onClick={() => setConfirming(false)} disabled={clearing} className="inline-flex min-h-12 items-center rounded-full border border-[#173f35]/18 px-5 py-3 text-sm font-semibold">取消</button></div></div> : <button type="button" onClick={() => setConfirming(true)} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#9b453c] px-5 py-3 text-sm font-medium text-white"><Trash size={17} />删除我的本机数据</button>}{message && <p className="mt-4 text-sm leading-6" role="status">{message}</p>}</section>

      <section className="mt-12 border-t border-[#173f35]/12 pt-8" aria-labelledby="media-license-title">
        <div className="flex items-start gap-3">
          <ImageSquare className="mt-0.5 shrink-0 text-[#76551f]" size={22} weight="duotone" aria-hidden="true" />
          <div>
            <h2 id="media-license-title" className="text-xl font-semibold">素材与许可</h2>
            <p className="mt-2 text-sm leading-7 text-[#61736a]">公开体验只使用已登记开放许可的实景素材。照片不能证明当前开放、入口、客流或路线状态。</p>
          </div>
        </div>
        <dl className="mt-6 border-y border-[#173f35]/10">
          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
            <dt className="font-semibold">国恩寺实景</dt>
            <dd className="text-sm leading-6 text-[#61736a]">Pkkj，CC BY-SA 4.0</dd>
            <dd><a href="https://commons.wikimedia.org/wiki/File:%E5%9B%BD%E6%81%A9%E5%AF%BA_20260527_144925.jpg" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold underline decoration-[#b88a43]/45 underline-offset-4">Commons 来源<ArrowSquareOut size={16} aria-hidden="true" /></a></dd>
          </div>
          <div className="grid gap-2 border-t border-[#173f35]/10 py-5 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
            <dt className="font-semibold">天露山周边图</dt>
            <dd className="text-sm leading-6 text-[#61736a]">Qiu Mao，CC BY 3.0。仅表示新兴县周边，不代表六祖镇。</dd>
            <dd className="flex flex-wrap gap-x-4">
              {[
                ["图 1", "https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(1).jpg"],
                ["图 10", "https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(10).jpg"],
                ["图 20", "https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(20).jpg"],
              ].map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold underline decoration-[#b88a43]/45 underline-offset-4">Commons {label}<ArrowSquareOut size={16} aria-hidden="true" /></a>)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
