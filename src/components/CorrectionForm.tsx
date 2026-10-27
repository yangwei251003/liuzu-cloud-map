"use client";

import { CheckCircle, NotePencil, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useState } from "react";
import { submitCorrection } from "@/lib/admin-governance-store";

type CorrectionFormProps = {
  subject: string;
  category?: "OPERATION" | "CONTENT" | "GIS" | "NARRATION" | "OTHER";
  onClose?: () => void;
};

export function CorrectionForm({ subject, category = "CONTENT", onClose }: CorrectionFormProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [reporterAlias, setReporterAlias] = useState("");
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function close() {
    setOpen(false);
    onClose?.();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = submitCorrection({
      subject: `${subject}信息纠错`,
      detail,
      category,
      reporterAlias,
      priority: "MEDIUM",
    });

    if (!result.ok) {
      setNotice(result.error);
      return;
    }

    setSubmitted(true);
    setNotice(`已在本机创建纠错单 ${result.ticket.id}，可由运营后台继续处理。`);
    setDetail("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#6e6049] underline decoration-[#b88a43]/45 underline-offset-4"
      >
        <NotePencil size={16} weight="duotone" />
        信息有误？提交纠错
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-[#173f35]/12 bg-white/55 p-4" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <strong className="text-sm">反馈“{subject}”的信息问题</strong>
          <p className="mt-1 text-xs leading-5 text-[#6d7b74]">反馈只保存在当前设备，并进入本机运营后台的纠错队列。</p>
        </div>
        <button type="button" onClick={close} aria-label="关闭纠错表单" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#173f35]/12">
          <X size={15} />
        </button>
      </div>

      {!submitted && (
        <>
          <label htmlFor={`correction-${subject}`} className="mt-4 block text-xs font-semibold">哪里不准确？正确情况是什么？</label>
          <textarea
            id={`correction-${subject}`}
            value={detail}
            onChange={(event) => { setDetail(event.target.value); setNotice(""); }}
            rows={3}
            maxLength={2000}
            required
            className="mt-2 w-full resize-y rounded-xl border border-[#173f35]/14 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#b88a43]"
            placeholder="例如：入口位置已调整，现场指引在……"
          />
          <label htmlFor={`correction-alias-${subject}`} className="mt-3 block text-xs font-semibold">称呼（选填）</label>
          <input
            id={`correction-alias-${subject}`}
            value={reporterAlias}
            onChange={(event) => setReporterAlias(event.target.value)}
            maxLength={60}
            className="mt-2 w-full rounded-xl border border-[#173f35]/14 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#b88a43]"
            placeholder="默认匿名游客"
          />
          <button type="submit" disabled={!detail.trim()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-4 py-3 text-sm font-medium text-white disabled:opacity-45">
            <PaperPlaneTilt size={17} weight="duotone" />提交到纠错队列
          </button>
        </>
      )}

      {notice && (
        <p className={`mt-3 flex items-start gap-2 text-xs leading-5 ${submitted ? "text-[#46705b]" : "text-[#a0443c]"}`} role="status">
          {submitted && <CheckCircle className="mt-0.5 shrink-0" size={16} weight="fill" />}
          {notice}
        </p>
      )}

      {submitted && (
        <button type="button" onClick={close} className="mt-4 w-full rounded-full border border-[#173f35]/15 px-4 py-2.5 text-sm font-medium">完成</button>
      )}
    </form>
  );
}
