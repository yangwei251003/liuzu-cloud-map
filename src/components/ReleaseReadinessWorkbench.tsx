"use client";

import { ArrowLeft, CheckCircle, DownloadSimple, FileArrowUp, ShieldWarning } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createReleaseEvidenceTemplate, evaluateReleaseReadiness, type ReleaseReadinessResult } from "@/lib/release-readiness";

const inputClass = "mt-3 min-h-72 w-full rounded-2xl border border-[#173f35]/14 bg-white/70 p-4 font-mono text-xs leading-6 outline-none focus:border-[#b88a43] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]";

function downloadTemplate() {
  const blob = new Blob([JSON.stringify(createReleaseEvidenceTemplate(), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "liuzu-release-evidence-template.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReleaseReadinessWorkbench() {
  const template = useMemo(() => JSON.stringify(createReleaseEvidenceTemplate(), null, 2), []);
  const [raw, setRaw] = useState(template);
  const [result, setResult] = useState<ReleaseReadinessResult | null>(null);
  const [parseError, setParseError] = useState("");

  function validate() {
    try {
      const parsed = JSON.parse(raw) as unknown;
      setResult(evaluateReleaseReadiness(parsed));
      setParseError("");
    } catch {
      setResult(null);
      setParseError("JSON 无法解析。系统没有猜测或修复原始证据，请先更正格式。");
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 256 * 1024) {
      setResult(null);
      setParseError("文件超过 256 KB，已拒绝读取。证据附件请保留在原系统，这里只导入引用清单。");
      return;
    }
    try {
      const nextRaw = await file.text();
      JSON.parse(nextRaw);
      setRaw(nextRaw);
      setResult(null);
      setParseError("");
    } catch {
      setResult(null);
      setParseError("导入文件不是可解析的 JSON，原文件未被修改。");
    }
  }

  return (
    <div className="paper-noise min-h-[100dvh] px-4 py-10 md:px-8 md:py-16">
      <div className="mx-auto max-w-[1200px]">
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/14 bg-white/55 px-4 text-sm font-semibold"><ArrowLeft size={17} />返回治理后台</Link>
        <div className="mt-10 grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-end">
          <div><span className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Release evidence gate</span><h1 className="mt-4 max-w-[12ch] text-4xl font-semibold leading-[1.03] tracking-[-.055em] md:text-6xl">证据齐全，才进入服务端复核</h1></div>
          <p className="max-w-[65ch] text-base leading-8 text-[#607169]">导入管理方、现场和专业审核形成的证据包。这里仅做严格结构与有效期预检，不保存数据，也不会把自填 JSON 直接变成正式 READY；真实发布仍须服务端身份、签名、数据库版本与原子发布共同确认。</p>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[2rem] border border-[#173f35]/10 bg-white/52 p-5 md:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">发布证据包</h2><p className="mt-1 text-xs leading-5 text-[#718078]">严格 schema；未知字段、缺失字段和过期证据都会失败关闭。</p></div><div className="flex flex-wrap gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-sm font-semibold active:scale-[.98]"><FileArrowUp size={17} />导入 JSON<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label><button type="button" onClick={downloadTemplate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-sm font-semibold active:scale-[.98]"><DownloadSimple size={17} />下载空白模板</button></div></div>
            <label htmlFor="release-evidence" className="mt-6 block text-sm font-semibold">JSON 内容</label>
            <textarea id="release-evidence" value={raw} onChange={(event) => { setRaw(event.target.value); setResult(null); setParseError(""); }} className={inputClass} spellCheck={false} aria-describedby="release-evidence-help" />
            <p id="release-evidence-help" className="mt-2 text-xs leading-5 text-[#718078]">模板故意是 BLOCKED，不包含伪造的审核人、路线实走或权利结论。</p>
            <button type="button" onClick={validate} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 text-sm font-semibold text-white active:scale-[.98]"><FileArrowUp size={18} />执行严格预检</button>
          </div>

          <aside className="rounded-[2rem] border border-[#173f35]/10 bg-[#f3eadc]/72 p-5 md:p-7" aria-live="polite">
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Machine-readable result</span>
            {!result && !parseError && <div className="mt-8 rounded-2xl border border-[#173f35]/10 bg-white/50 p-5 text-sm leading-7 text-[#607169]">等待证据包。未运行时不会显示通过状态。</div>}
            {parseError && <div role="alert" className="mt-8 rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed] p-5 text-sm leading-7 text-[#7b4b43]"><ShieldWarning size={25} className="mb-2" />{parseError}</div>}
            {result && <div className="mt-8">
              <div className={`rounded-2xl border p-5 ${result.status === "BLOCKED" ? "border-[#9b453c]/20 bg-[#fff6ed] text-[#74473f]" : "border-[#47745f]/20 bg-[#e4eee7] text-[#315946]"}`}>{result.status === "BLOCKED" ? <ShieldWarning size={28} weight="duotone" /> : <CheckCircle size={28} weight="duotone" />}<strong className="mt-3 block text-xl">{result.status === "BLOCKED" ? "证据包仍被阻断" : "可提交服务端复核"}</strong><p className="mt-2 text-sm leading-6">{result.status === "BLOCKED" ? `发现 ${result.issues.length} 项阻断；不会产生 READY。` : "本地预检无阻断，但仍不是正式 READY。"}</p></div>
              <dl className="mt-5 grid gap-2 text-xs leading-5"><div><dt className="text-[#807462]">检查时间</dt><dd className="break-all font-mono">{result.checkedAt}</dd></div><div><dt className="text-[#807462]">证据版本组合</dt><dd className="break-all font-mono">{result.bundleRevision}</dd></div></dl>
              {result.issues.length > 0 && <ol className="mt-6 space-y-3">{result.issues.map((issue, index) => <li key={`${issue.code}-${issue.path}-${index}`} className="rounded-xl border border-[#9b453c]/12 bg-white/55 p-4"><span className="font-mono text-[10px] font-semibold text-[#9b453c]">{issue.code} · {issue.path}</span><p className="mt-2 text-sm leading-6 text-[#6e5b55]">{issue.message}</p></li>)}</ol>}
            </div>}
          </aside>
        </section>
      </div>
    </div>
  );
}
