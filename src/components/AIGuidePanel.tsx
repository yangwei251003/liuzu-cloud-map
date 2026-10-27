"use client";

import {
  ArrowUp,
  BookBookmark,
  ChatCenteredText,
  LinkSimple,
  SealCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import {
  AI_GUIDE_FACT_TYPE_LABELS,
  AI_GUIDE_REVIEW_STATUS_LABELS,
  AI_GUIDE_SOURCE_STATUS_LABELS,
  parseAIGuideAnswer,
  type AIGuideAnswer,
  type AIGuideError,
} from "@/lib/ai-guide/types";
import { saveKnowledgeReference } from "@/lib/saved-knowledge-store";

export type AIGuidePanelProps = {
  spotId?: string;
  spotName?: string;
  title?: string;
  description?: string;
  endpoint?: string;
  suggestions?: string[];
  className?: string;
  onAnswer?: (answer: AIGuideAnswer) => void;
};

const defaultSuggestions = [
  "国恩寺为什么是全国重点文物保护单位？",
  "六祖传说为什么要标注为民间文学？",
  "六祖镇和六祖故里旅游度假区有什么区别？",
];

function isGuideError(value: unknown): value is AIGuideError {
  return typeof value === "object" && value !== null && "error" in value;
}

export function AIGuidePanel({
  spotId,
  spotName,
  title = "问问禅小荔",
  description = "只基于已登记资料回答，事实附来源；不确定的现场信息会明确拒答。",
  endpoint = "/api/ai-guide",
  suggestions = defaultSuggestions,
  className,
  onAnswer,
}: AIGuidePanelProps) {
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AIGuideAnswer>();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [remoteConsent, setRemoteConsent] = useState(false);

  async function askGuide(nextQuestion: string) {
    const normalizedQuestion = nextQuestion.trim();
    if (normalizedQuestion.length < 2) {
      setErrorMessage("请至少输入 2 个字符。");
      setStatus("error");
      return;
    }

    setQuestion(normalizedQuestion);
    setStatus("loading");
    setErrorMessage("");
    setSaveStatus("idle");
    setSaveMessage("");
    const allowRemote = remoteConsent;
    setRemoteConsent(false);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: normalizedQuestion,
          ...(spotId ? { spotId } : {}),
          allowRemote,
        }),
      });

      const payload: unknown = await response.json();
      if (!response.ok || isGuideError(payload)) {
        throw new Error(isGuideError(payload) ? payload.error.message : "导游暂时无法回答。");
      }
      const parsed = parseAIGuideAnswer(payload);
      if (!parsed) throw new Error("回答的事实类型或来源状态未通过校验，已拒绝展示。");

      setAnswer(parsed);
      setStatus("idle");
      onAnswer?.(parsed);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "导游暂时无法回答。");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askGuide(question);
  }

  function saveCurrentAnswer() {
    if (!answer || answer.refused) return;
    const result = saveKnowledgeReference({ question, answer, spotId, spotName });
    if (!result.ok) {
      setSaveStatus("error");
      setSaveMessage(result.error);
      return;
    }
    setSaveStatus("saved");
    setSaveMessage(result.duplicate ? "这张来源卡片已经保存在当前设备。" : "来源卡片已私有保存；没有保存 AI 回答全文。 ");
  }

  return (
    <section
      className={[
        "overflow-hidden rounded-[2rem] border border-[#173f35]/12 bg-[#fffaf0] shadow-[0_24px_70px_rgba(36,65,53,.12)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={inputId + "-title"}
    >
      <div className="border-b border-[#173f35]/10 bg-[#e8efe9] px-5 py-5 md:px-7">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#173f35] text-[#fffaf0]">
            <Sparkle size={21} weight="duotone" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#9b7a42]">
              AI knowledge guide
            </p>
            <h2
              id={inputId + "-title"}
              className="cultural-page-title mt-1 text-2xl text-[#173f35]"
            >
              {title}
            </h2>
            <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[#5f7169]">
              {description}
              {spotName ? " 当前景点：" + spotName + "。" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-7">
        <form onSubmit={handleSubmit}>
          <label htmlFor={inputId} className="block text-sm font-semibold text-[#173f35]">
            你想了解什么？
          </label>
          <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
            <textarea
              id={inputId}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              maxLength={240}
              placeholder="例如：国恩寺的文保身份是什么？"
              className="min-h-24 w-full resize-y rounded-2xl border border-[#173f35]/16 bg-white/70 px-4 py-3 text-base leading-7 text-[#173f35] outline-none transition-colors placeholder:text-[#829087] focus:border-[#9b7a42]"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              aria-label="向禅小荔提问"
              className="grid h-12 w-12 place-items-center rounded-full bg-[#173f35] text-[#fffaf0] transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-55"
            >
              <ArrowUp size={20} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#718078]">
            <span>默认本地处理；不会上传连续位置或自动调用路线工具</span>
            <span>{question.length}/240</span>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#173f35]/10 bg-[#eef2eb] p-4 text-xs leading-6 text-[#536a60]">
            <input type="checkbox" checked={remoteConsent} onChange={(event) => setRemoteConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[#173f35]" />
            <span><strong className="block text-sm text-[#294c41]">仅下一次提问允许 Gemini 辅助整理</strong>勾选后只发送当次问题与已登记的项目知识，不发送定位、游记或本机旅程；发出一次后自动取消授权。</span>
          </label>
        </form>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="推荐问题">
          {suggestions.slice(0, 4).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void askGuide(suggestion)}
              disabled={status === "loading"}
              className="rounded-full border border-[#173f35]/12 bg-[#f4eadb] px-3 py-2 text-left text-xs leading-5 text-[#52675e] transition-colors hover:border-[#9b7a42]/50 hover:bg-[#efe0c9] active:scale-[0.98] disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="mt-7 min-h-44" aria-live="polite" aria-busy={status === "loading"}>
          {status === "loading" ? (
            <div className="rounded-2xl border border-[#173f35]/10 bg-[#f6f0e6] p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-[#52675e]">
                <ChatCenteredText size={19} weight="duotone" aria-hidden="true" />
                正在核对已登记知识
              </div>
              <div className="mt-5 space-y-3" aria-hidden="true">
                <div className="h-3 w-full animate-pulse rounded-full bg-[#d9dfd5]" />
                <div className="h-3 w-[88%] animate-pulse rounded-full bg-[#d9dfd5]" />
                <div className="h-3 w-[64%] animate-pulse rounded-full bg-[#d9dfd5]" />
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <div
              role="alert"
              className="rounded-2xl border border-[#a14d42]/18 bg-[#f8e9e3] p-5 text-[#733c35]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <WarningCircle size={20} weight="duotone" aria-hidden="true" />
                暂时没有得到回答
              </div>
              <p className="mt-2 text-sm leading-6">{errorMessage}</p>
              {question.trim().length >= 2 ? (
                <button
                  type="button"
                  onClick={() => void askGuide(question)}
                  className="mt-4 rounded-full border border-[#733c35]/20 px-4 py-2 text-xs font-semibold active:scale-[0.98]"
                >
                  重新尝试
                </button>
              ) : null}
            </div>
          ) : null}

          {status === "idle" && !answer ? (
            <div className="rounded-2xl border border-dashed border-[#173f35]/18 px-5 py-7 text-center">
              <ChatCenteredText
                className="mx-auto text-[#9b7a42]"
                size={30}
                weight="duotone"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-semibold text-[#38564d]">从一个有证据的问题开始</p>
              <p className="mx-auto mt-2 max-w-[44ch] text-xs leading-6 text-[#718078]">
                文化事实会列出来源；开放、路线或安全信息无法核验时，导游会直接说明。
              </p>
            </div>
          ) : null}

          {status === "idle" && answer ? (
            <article className="rounded-2xl border border-[#173f35]/10 bg-[#f6f0e6] p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dfe9df] px-2.5 py-1 font-semibold text-[#3f624f]">
                  <SealCheck size={15} weight="duotone" aria-hidden="true" />
                  {answer.refused ? "证据不足，已拒答" : "附来源回答"}
                </span>
                <span className="text-[#78857f]">
                  {answer.provider === "gemini-assisted" ? "Gemini 辅助整理" : "本地知识降级"}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#2f5046]">
                {answer.answer}
              </p>

              <div className="mt-4 rounded-xl border border-[#b88a43]/18 bg-white/50 p-3" aria-label="本次回答事实类型">
                <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7a684b]">事实类型</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {answer.factTypes.length ? answer.factTypes.map((factType) => (
                    <span key={factType} className="rounded-full bg-[#e5eadf] px-2.5 py-1 text-xs font-medium text-[#3f624f]">{AI_GUIDE_FACT_TYPE_LABELS[factType]}</span>
                  )) : <span className="rounded-full bg-[#eee5d8] px-2.5 py-1 text-xs text-[#6f6557]">未形成事实回答 · 已拒答</span>}
                </div>
              </div>

              <div className="mt-5 border-t border-[#173f35]/10 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-[.16em] text-[#7a684b]">
                  本次来源
                </h3>
                <ul className="mt-3 space-y-2">
                  {answer.sources.map((source) => (
                    <li key={source.id}>
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex min-h-11 items-start gap-3 rounded-xl border border-[#173f35]/10 bg-white/55 px-3 py-2.5 text-xs text-[#52675e] transition-colors hover:border-[#9b7a42]/40"
                        >
                          <LinkSimple
                            className="mt-0.5 shrink-0 text-[#9b7a42]"
                            size={16}
                            aria-hidden="true"
                          />
                          <span>
                            <strong className="block font-semibold text-[#294c41]">
                              [{source.id}] {source.title}
                            </strong>
                            <span className="mt-1 block leading-5">
                              {source.publisher} · 核验 {source.checkedAt}
                            </span>
                            <span className="mt-1 block leading-5 text-[#6f786f]">{AI_GUIDE_FACT_TYPE_LABELS[source.factType]} · {AI_GUIDE_SOURCE_STATUS_LABELS[source.sourceStatus]}</span>
                            <span className="block leading-5 text-[#7c6e58]">{AI_GUIDE_REVIEW_STATUS_LABELS[source.reviewStatus]}</span>
                          </span>
                        </a>
                      ) : (
                        <div className="rounded-xl border border-[#173f35]/10 bg-white/55 px-3 py-2.5 text-xs text-[#52675e]">
                          <strong className="block text-[#294c41]">
                            [{source.id}] {source.title}
                          </strong>
                          <span className="mt-1 block leading-5">
                            {source.publisher} · 核验 {source.checkedAt}
                          </span>
                          <span className="mt-1 block leading-5 text-[#6f786f]">{AI_GUIDE_FACT_TYPE_LABELS[source.factType]} · {AI_GUIDE_SOURCE_STATUS_LABELS[source.sourceStatus]}</span>
                          <span className="block leading-5 text-[#7c6e58]">{AI_GUIDE_REVIEW_STATUS_LABELS[source.reviewStatus]}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-4 text-[11px] leading-5 text-[#7a867f]">{answer.notice}</p>
              {!answer.refused ? (
                <div className="mt-5 border-t border-[#173f35]/10 pt-4">
                  <button
                    type="button"
                    onClick={saveCurrentAnswer}
                    disabled={saveStatus === "saved"}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/15 bg-white/65 px-4 py-2.5 text-xs font-semibold text-[#385b4e] outline-none disabled:cursor-default disabled:opacity-65 focus-visible:ring-2 focus-visible:ring-[#9b7a42] focus-visible:ring-offset-2"
                  >
                    <BookBookmark size={17} weight="duotone" aria-hidden="true" />
                    {saveStatus === "saved" ? "已保存来源卡片" : "保存来源卡片"}
                  </button>
                  {saveMessage ? (
                    <p role={saveStatus === "error" ? "alert" : "status"} className={`mt-3 text-xs leading-5 ${saveStatus === "error" ? "text-[#8d493e]" : "text-[#526d61]"}`}>
                      {saveMessage}
                      {saveStatus === "saved" ? <a href="/journey/knowledge" className="ml-2 font-semibold underline underline-offset-4">查看我的知识卡</a> : null}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
