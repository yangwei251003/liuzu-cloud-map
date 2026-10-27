"use client";

import { ArrowRight, BookBookmark, LinkSimple, Trash, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  AI_GUIDE_FACT_TYPE_LABELS,
  AI_GUIDE_REVIEW_STATUS_LABELS,
  AI_GUIDE_SOURCE_STATUS_LABELS,
} from "@/lib/ai-guide/types";
import {
  deleteKnowledgeReference,
  readSavedKnowledgeData,
  SAVED_KNOWLEDGE_STORAGE_KEY,
  type SavedKnowledgeReference,
} from "@/lib/saved-knowledge-store";

export function SavedKnowledgeCenter() {
  const [items, setItems] = useState<SavedKnowledgeReference[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  function refresh() {
    const result = readSavedKnowledgeData();
    setItems(result.data.items);
    setStatus(result.error ? "error" : "ready");
    setMessage(result.error ?? "");
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(refresh);
    function onStorage(event: StorageEvent) {
      if (event.key === SAVED_KNOWLEDGE_STORAGE_KEY) refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function remove(item: SavedKnowledgeReference) {
    if (!window.confirm(`删除知识卡“${item.question}”？此操作无法撤销。`)) return;
    const result = deleteKnowledgeReference(item.id);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error);
      return;
    }
    refresh();
    setMessage("知识卡已从这台设备删除。");
  }

  return (
    <div className="paper-noise min-h-[100dvh] bg-[#f7f1e7] pb-16 text-[#173f35]">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
        <div className="grid gap-6 border-b border-[#173f35]/12 pb-9 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Private references</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-.045em] md:text-6xl">把出处带回旅程</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#60736a]">
              这里只保存问题与来源引用，不保存 AI 回答全文。再次使用前请重新核对，以免继续展示已撤回或过期内容。
            </p>
          </div>
          <a href="/guide/ask" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#b88a43] focus-visible:ring-offset-2">
            继续提问 <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>

        {status === "loading" ? (
          <div role="status" className="mt-10 grid gap-3" aria-label="正在读取知识卡">
            {[0, 1].map((item) => <div key={item} className="h-40 animate-pulse rounded-[1.8rem] bg-[#173f35]/6 motion-reduce:animate-none" />)}
          </div>
        ) : null}

        {status === "error" ? (
          <div role="alert" className="mt-8 flex items-start gap-3 rounded-2xl border border-[#9b453c]/20 bg-[#fff3e9] p-5 text-sm leading-6 text-[#7b493f]">
            <WarningCircle className="mt-0.5 shrink-0" size={20} weight="duotone" aria-hidden="true" />
            <span>{message}</span>
          </div>
        ) : null}

        {status === "ready" && items.length === 0 ? (
          <section className="mt-10 rounded-[2rem] border border-dashed border-[#173f35]/18 px-6 py-14 text-center">
            <BookBookmark className="mx-auto text-[#9b7a42]" size={40} weight="duotone" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">还没有保存知识卡</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[#6c7b74]">向禅小荔提出有出处的问题，在回答下方选择“保存来源卡片”。</p>
          </section>
        ) : null}

        {status === "ready" && items.length > 0 ? (
          <ol className="mt-10 grid gap-5">
            {items.map((item) => (
              <li key={item.id} className="rounded-[2rem] border border-[#173f35]/10 bg-[#fffaf0] p-5 shadow-[0_18px_55px_rgba(38,66,54,.08)] md:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#7a725f]">
                      <span className="rounded-full bg-[#e5eadf] px-2.5 py-1 font-semibold text-[#3f624f]">仅存来源引用</span>
                      {item.spotName ? <span>{item.spotName}</span> : null}
                      <span>保存于 {new Date(item.savedAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold leading-8 tracking-[-.025em]">{item.question}</h2>
                    <div className="mt-3 flex flex-wrap gap-2" aria-label="知识卡事实类型">
                      {item.factTypes.map((factType) => <span key={factType} className="rounded-full bg-[#f0e4d3] px-2.5 py-1 text-xs text-[#6f5938]">{AI_GUIDE_FACT_TYPE_LABELS[factType]}</span>)}
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(item)} aria-label={`删除知识卡：${item.question}`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#9b453c]/18 px-4 py-2 text-xs font-semibold text-[#8d493e] outline-none focus-visible:ring-2 focus-visible:ring-[#9b453c] focus-visible:ring-offset-2">
                    <Trash size={16} aria-hidden="true" />删除
                  </button>
                </div>

                <ul className="mt-5 grid gap-2">
                  {item.sources.map((source) => (
                    <li key={`${item.id}-${source.id}`} className="rounded-2xl border border-[#173f35]/9 bg-white/55 p-4 text-xs leading-5 text-[#5c7067]">
                      <div className="flex items-start gap-2">
                        <LinkSimple className="mt-0.5 shrink-0 text-[#9b7a42]" size={16} aria-hidden="true" />
                        <div>
                          {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-[#294c41] underline decoration-[#9b7a42]/40 underline-offset-4">[{source.id}] {source.title}</a> : <strong className="text-[#294c41]">[{source.id}] {source.title}</strong>}
                          <span className="mt-1 block">{source.publisher} · 来源核验 {source.checkedAt}</span>
                          <span className="block">{AI_GUIDE_FACT_TYPE_LABELS[source.factType]} · {AI_GUIDE_SOURCE_STATUS_LABELS[source.sourceStatus]}</span>
                          <span className="block text-[#7c6e58]">{AI_GUIDE_REVIEW_STATUS_LABELS[source.reviewStatus]}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-col gap-3 border-t border-[#173f35]/10 pt-5 text-xs leading-5 text-[#708078] sm:flex-row sm:items-center sm:justify-between">
                  <span>回答生成于 {new Date(item.answerGeneratedAt).toLocaleString("zh-CN")}；卡片不证明来源仍有效。</span>
                  <a href={`/guide/ask${item.spotId ? `?spot=${encodeURIComponent(item.spotId)}` : ""}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-[#47665a] underline underline-offset-4">重新向导游核对 <ArrowRight size={15} aria-hidden="true" /></a>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {message && status === "ready" ? <p role="status" className="mt-5 text-sm text-[#526d61]">{message}</p> : null}
      </div>
    </div>
  );
}
