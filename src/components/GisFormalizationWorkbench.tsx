"use client";

import {
  ArrowClockwise,
  CheckCircle,
  FileLock,
  LinkSimple,
  MapTrifold,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  parseGisFormalizationOverview,
  parseGisFormalizationReceipt,
  type GisFormalizationDirection,
  type GisFormalizationEntranceType,
  type GisFormalizationOverview,
  type GisFormalizationPathLayer,
  type GisFormalizationReceipt,
} from "@/lib/gis-formalization-contract";
import { parseGisDraftSubmissionDetail, type GisDraftSubmissionDetail } from "@/lib/gis-draft-review-contract";

const SCENIC_AREA_ID = "liuzu-town";
const ENDPOINT = `/api/v1/admin/scenic-areas/${SCENIC_AREA_ID}/gis-formalizations`;
const SUBMISSION_ENDPOINT = `/api/v1/admin/scenic-areas/${SCENIC_AREA_ID}/gis-draft-submissions`;

type Phase = "loading" | "ready" | "submitting" | "success" | "error" | "unavailable";
type PathSelection = { layer: GisFormalizationPathLayer | ""; walkingDirection: GisFormalizationDirection | "" };

function errorMessage(value: unknown, fallback: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return fallback;
  return typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : fallback;
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function parseOverviewEnvelope(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return parseGisFormalizationOverview((value as { overview?: unknown }).overview);
}

function parseDetailEnvelope(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return parseGisDraftSubmissionDetail((value as { detail?: unknown }).detail);
}

function parseReceiptEnvelope(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return parseGisFormalizationReceipt((value as { receipt?: unknown }).receipt);
}

function validHttps(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

function localTimeToIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const fieldClass = "min-h-11 w-full rounded-xl border border-[#173f35]/14 bg-white px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b88a43] disabled:opacity-50";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";

export function GisFormalizationWorkbench() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<GisFormalizationOverview | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GisDraftSubmissionDetail | null>(null);
  const [detailPhase, setDetailPhase] = useState<Phase>("ready");
  const [pathSelections, setPathSelections] = useState<Record<string, PathSelection>>({});
  const [entranceSelections, setEntranceSelections] = useState<Record<string, GisFormalizationEntranceType | "">>({});
  const [providerName, setProviderName] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [fieldEvidenceReference, setFieldEvidenceReference] = useState("");
  const [licenseReference, setLicenseReference] = useState("");
  const [rightsHolder, setRightsHolder] = useState("");
  const [coordinateAccuracyMeters, setCoordinateAccuracyMeters] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [operationalSourceReference, setOperationalSourceReference] = useState("");
  const [operationalResponsibleParty, setOperationalResponsibleParty] = useState("");
  const [operationalExpiresAt, setOperationalExpiresAt] = useState("");
  const [prepareAcknowledgements, setPrepareAcknowledgements] = useState([false, false, false, false]);
  const [managementEvidence, setManagementEvidence] = useState("");
  const [publishAcknowledgements, setPublishAcknowledgements] = useState([false, false, false]);
  const prepareAttempt = useRef<{ payload: string; key: string } | null>(null);
  const publishAttempt = useRef<{ releaseId: string; payload: string; key: string } | null>(null);
  const requestVersion = useRef(0);

  const loadOverview = useCallback(async () => {
    const version = ++requestVersion.current;
    setPhase("loading");
    setNotice(null);
    try {
      const response = await fetch(ENDPOINT, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as unknown;
      if (version !== requestVersion.current) return;
      if (!response.ok) {
        setPhase(response.status === 503 ? "unavailable" : "error");
        setNotice(errorMessage(payload, "GIS 正式化队列暂不可用。"));
        return;
      }
      const parsed = parseOverviewEnvelope(payload);
      if (!parsed) { setPhase("error"); setNotice("正式化队列响应未通过严格校验。"); return; }
      setOverview(parsed);
      setPhase("ready");
    } catch {
      if (version !== requestVersion.current) return;
      setPhase("error");
      setNotice("无法连接 GIS 正式化服务；没有生成或发布任何正式数据。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [loadOverview]);

  const paths = useMemo(() => detail?.collection.drafts.filter((draft) => draft.objectType === "PATH") ?? [], [detail]);
  const entrances = useMemo(() => detail?.collection.drafts.filter((draft) => draft.objectType === "ENTRANCE") ?? [], [detail]);

  async function openSubmission(submissionId: string) {
    setSelectedSubmissionId(submissionId);
    setDetail(null);
    setDetailPhase("loading");
    setNotice(null);
    prepareAttempt.current = null;
    try {
      const response = await fetch(`${SUBMISSION_ENDPOINT}/${encodeURIComponent(submissionId)}`, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) { setDetailPhase(response.status === 503 ? "unavailable" : "error"); setNotice(errorMessage(payload, "候选详情暂不可用。")); return; }
      const parsed = parseDetailEnvelope(payload);
      if (!parsed || parsed.receipt.submissionId !== submissionId || parsed.receipt.state !== "APPROVED_FOR_FORMALIZATION") { setDetailPhase("error"); setNotice("候选详情不是当前已审核待正式化版本。"); return; }
      setDetail(parsed);
      setPathSelections(Object.fromEntries(parsed.collection.drafts.filter((draft) => draft.objectType === "PATH").map((draft) => [draft.id, { layer: "", walkingDirection: "" }])));
      setEntranceSelections(Object.fromEntries(parsed.collection.drafts.filter((draft) => draft.objectType === "ENTRANCE").map((draft) => [draft.id, ""])));
      setDetailPhase("ready");
    } catch { setDetailPhase("error"); setNotice("读取已审核候选失败；正式化操作保持关闭。"); }
  }

  async function prepare() {
    if (!detail || phase === "submitting") return;
    const validUntilIso = localTimeToIso(validUntil);
    const operationalExpiresIso = localTimeToIso(operationalExpiresAt);
    const pathPolicies = paths.map((path) => ({ draftId: path.id, ...pathSelections[path.id] }));
    const entrancePolicies = entrances.map((entrance) => ({ draftId: entrance.id, type: entranceSelections[entrance.id] }));
    const accuracy = Number(coordinateAccuracyMeters);
    if (
      !providerName.trim() || !rightsHolder.trim() || !validHttps(sourceReference) || !validHttps(fieldEvidenceReference) || !validHttps(licenseReference)
      || !validHttps(operationalSourceReference) || !operationalResponsibleParty.trim() || !validUntilIso || !operationalExpiresIso
      || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 50
      || pathPolicies.some((policy) => !policy.layer || !policy.walkingDirection) || entrancePolicies.some((policy) => !policy.type)
      || !prepareAcknowledgements.every(Boolean)
    ) { setPhase("error"); setNotice("请补齐证据、有效期、坐标精度、每条路径的分层/方向、每个入口类型和四项确认。"); return; }
    const body = {
      schemaVersion: 1,
      submissionId: detail.receipt.submissionId,
      expectedSubmissionWorkflowRevision: 2,
      providerName: providerName.trim(),
      sourceReference: sourceReference.trim(), fieldEvidenceReference: fieldEvidenceReference.trim(), licenseReference: licenseReference.trim(), rightsHolder: rightsHolder.trim(),
      coordinateAccuracyMeters: accuracy, validUntil: validUntilIso,
      operationalSourceReference: operationalSourceReference.trim(), operationalResponsibleParty: operationalResponsibleParty.trim(), operationalExpiresAt: operationalExpiresIso,
      pathPolicies, entrancePolicies,
      acknowledgeAllObjectSourcesVerified: true,
      acknowledgeRightsPermitDisplayRoutingCachingDerivatives: true,
      acknowledgeExactTopologyNoImplicitSnapping: true,
      acknowledgeNotesExcludedFromPublication: true,
    };
    const payload = JSON.stringify(body);
    const key = prepareAttempt.current?.payload === payload ? prepareAttempt.current.key : newIdempotencyKey("gis-formalization-prepare");
    prepareAttempt.current = { payload, key };
    setPhase("submitting"); setNotice(null);
    try {
      const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", Accept: "application/json", "idempotency-key": key }, body: payload });
      const result = await response.json().catch(() => null) as unknown;
      if (!response.ok) { setPhase("error"); setNotice(errorMessage(result, "正式化候选未生成。")); return; }
      const receipt = parseReceiptEnvelope(result);
      if (!receipt || receipt.submissionId !== detail.receipt.submissionId || receipt.lifecycleState !== "PREPARED") { setPhase("error"); setNotice("正式化回执未通过严格校验，界面不会标记成功。"); return; }
      setSelectedSubmissionId(null); setDetail(null);
      await loadOverview();
      setPhase("success"); setNotice(`不可变正式化候选已生成：${receipt.nodeCount} 个节点、${receipt.edgeCount} 条有向边；尚未发布。`);
    } catch { setPhase("error"); setNotice("正式化服务连接失败；可使用相同内容安全重试。"); }
  }

  async function publish(candidate: GisFormalizationReceipt) {
    if (phase === "submitting") return;
    if (!validHttps(managementEvidence) || !publishAcknowledgements.every(Boolean)) { setPhase("error"); setNotice("请填写管理发布证据并完成三项发布确认。"); return; }
    const body = { schemaVersion: 1, expectedWorkflowRevision: 1, managementEvidenceReference: managementEvidence.trim(), acknowledgeAtomicReplacement: true, acknowledgeAllEdgesInitiallyOpen: true, acknowledgeOfflinePackRequiresSeparateRelease: true };
    const payload = JSON.stringify(body);
    const previous = publishAttempt.current;
    const key = previous?.releaseId === candidate.id && previous.payload === payload ? previous.key : newIdempotencyKey("gis-formalization-publish");
    publishAttempt.current = { releaseId: candidate.id, payload, key };
    setPhase("submitting"); setNotice(null);
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(candidate.id)}/publish`, { method: "POST", headers: { "content-type": "application/json", Accept: "application/json", "idempotency-key": key }, body: payload });
      const result = await response.json().catch(() => null) as unknown;
      if (!response.ok) { setPhase("error"); setNotice(errorMessage(result, "正式 GIS 未发布。")); return; }
      const receipt = parseReceiptEnvelope(result);
      if (!receipt || receipt.id !== candidate.id || receipt.lifecycleState !== "PUBLISHED" || receipt.snapshotRevision === null) { setPhase("error"); setNotice("发布回执未通过严格校验，界面不会宣称成功。"); return; }
      setManagementEvidence(""); setPublishAcknowledgements([false, false, false]);
      await loadOverview();
      setPhase("success"); setNotice(`正式快照 revision ${receipt.snapshotRevision} 已原子发布；离线包仍需独立审核、签名与分发。`);
    } catch { setPhase("error"); setNotice("发布服务连接失败；事务结果未知前请使用相同内容与幂等键重试。"); }
  }

  const preparedCandidates = overview?.candidates.filter((candidate) => candidate.lifecycleState === "PREPARED") ?? [];

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-24 pt-5 text-[#173f35] sm:px-6 lg:px-8">
      <section className="rounded-[1.6rem] border border-[#b88a43]/24 bg-[#f4eadb] p-5 text-sm leading-6 text-[#685532]">
        <strong className="flex items-center gap-2 text-[#755a2c]"><WarningCircle size={21} weight="fill" />正式化不是自动发布</strong>
        <p className="mt-1">候选必须经过编辑、专业审核、另一位 GIS 人员正式化准备、再由独立发布管理员确认。端点不自动吸附，开放状态不从草稿推断。</p>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#9b7a42]">N9 formalization</span><h2 className="mt-1 text-2xl font-semibold">正式路网发布工作台</h2></div>
        <button type="button" onClick={() => void loadOverview()} disabled={phase === "loading" || phase === "submitting"} className={`${buttonClass} border border-[#173f35]/14 bg-white`}><ArrowClockwise size={18} className={phase === "loading" ? "animate-spin" : ""} />刷新</button>
      </div>
      {notice && <p className={`mt-4 rounded-xl border p-3 text-sm leading-6 ${phase === "success" ? "border-[#3e735f]/20 bg-[#e7eee8] text-[#315944]" : "border-[#a85749]/20 bg-[#f8e8e3] text-[#714a43]"}`} role="status">{notice}</p>}
      {(phase === "loading" || phase === "unavailable") && !overview && <div className="mt-5 rounded-2xl border border-[#173f35]/10 bg-white p-6 text-sm">{phase === "loading" ? <span className="flex items-center gap-2"><SpinnerGap size={19} className="animate-spin" />正在读取正式化队列…</span> : "正式化服务默认失败关闭；需要真 PostGIS、可信身份和显式开关。"}</div>}

      {overview?.actorRole === "GIS_REVIEWER" && <div className="mt-5 grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-[1.6rem] border border-[#173f35]/10 bg-white/75 p-4">
          <h3 className="font-semibold">已审核待正式化 · {overview.approvedSubmissions.length}</h3>
          <div className="mt-3 grid gap-2">{overview.approvedSubmissions.map((submission) => <button key={submission.submissionId} type="button" onClick={() => void openSubmission(submission.submissionId)} className={`rounded-xl border p-3 text-left ${selectedSubmissionId === submission.submissionId ? "border-[#173f35] bg-[#e7eee8]" : "border-[#173f35]/10 bg-[#fffdf8]"}`}><span className="block text-sm font-semibold">候选版本 #{submission.submissionRevision}</span><span className="mt-1 block text-xs text-[#64736c]">{submission.objectCount} 项 · 审核于 {formatDate(submission.reviewedAt)}</span><span className="mt-1 block truncate font-mono text-[10px] text-[#7b8983]">{submission.contentSha256}</span></button>)}</div>
          {overview.approvedSubmissions.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-[#173f35]/18 p-4 text-xs leading-5 text-[#64736c]">当前没有尚未生成正式化候选的审核通过版本。</p>}
        </aside>
        <main className="rounded-[1.7rem] border border-[#173f35]/10 bg-white/70 p-5">
          {!detail && detailPhase !== "loading" && <div className="grid min-h-[420px] place-items-center text-center"><div><MapTrifold size={40} className="mx-auto text-[#9b7a42]" /><h3 className="mt-3 text-lg font-semibold">选择一个已审核版本</h3><p className="mt-2 text-sm text-[#64736c]">逐条指定分层和方向后才能生成不可变计划。</p></div></div>}
          {detailPhase === "loading" && <div className="grid min-h-[420px] place-items-center"><span className="flex items-center gap-2"><SpinnerGap size={20} className="animate-spin" />正在重新核对候选摘要…</span></div>}
          {detail && <div>
            <h3 className="text-lg font-semibold">候选 #{detail.receipt.submissionRevision} · 正式化参数</h3>
            <p className="mt-1 text-xs text-[#64736c]">专业审核通过不等于道路开放；下列字段必须来自可追溯的现场/管理证据。</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">数据提供方<input className={`${fieldClass} mt-1.5`} value={providerName} onChange={(event) => setProviderName(event.target.value)} /></label>
              <label className="text-xs font-semibold">权利主体<input className={`${fieldClass} mt-1.5`} value={rightsHolder} onChange={(event) => setRightsHolder(event.target.value)} /></label>
              <label className="text-xs font-semibold">正式来源 HTTPS<input type="url" className={`${fieldClass} mt-1.5`} value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="https://…" /></label>
              <label className="text-xs font-semibold">现场核验 HTTPS<input type="url" className={`${fieldClass} mt-1.5`} value={fieldEvidenceReference} onChange={(event) => setFieldEvidenceReference(event.target.value)} placeholder="https://…" /></label>
              <label className="text-xs font-semibold">许可证明 HTTPS<input type="url" className={`${fieldClass} mt-1.5`} value={licenseReference} onChange={(event) => setLicenseReference(event.target.value)} placeholder="https://…" /></label>
              <label className="text-xs font-semibold">坐标精度（米，≤50）<input type="number" min="0.1" max="50" step="0.1" className={`${fieldClass} mt-1.5`} value={coordinateAccuracyMeters} onChange={(event) => setCoordinateAccuracyMeters(event.target.value)} /></label>
              <label className="text-xs font-semibold">静态数据有效至（≤30天）<input type="datetime-local" className={`${fieldClass} mt-1.5`} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
              <label className="text-xs font-semibold">初始运营状态有效至（≤72小时）<input type="datetime-local" className={`${fieldClass} mt-1.5`} value={operationalExpiresAt} onChange={(event) => setOperationalExpiresAt(event.target.value)} /></label>
              <label className="text-xs font-semibold">运营状态来源 HTTPS<input type="url" className={`${fieldClass} mt-1.5`} value={operationalSourceReference} onChange={(event) => setOperationalSourceReference(event.target.value)} placeholder="https://…" /></label>
              <label className="text-xs font-semibold">运营责任方<input className={`${fieldClass} mt-1.5`} value={operationalResponsibleParty} onChange={(event) => setOperationalResponsibleParty(event.target.value)} /></label>
            </div>
            <section className="mt-6"><h4 className="text-sm font-semibold">路径分层与方向 · {paths.length}</h4><div className="mt-3 grid gap-2">{paths.map((path) => <div key={path.id} className="grid gap-2 rounded-xl border border-[#173f35]/10 bg-[#fffdf8] p-3 sm:grid-cols-[minmax(0,1fr)_170px_190px] sm:items-center"><div><strong className="text-sm">{path.title}</strong><span className="mt-1 block text-[10px] text-[#64736c]">{path.routingAttributes?.traversalMode} · {path.id}</span>{path.routingAttributes?.transportService && <span className="mt-1 block text-[10px] text-[#725929]">{path.routingAttributes.transportService.serviceName} · 候乘/登乘 {path.routingAttributes.transportService.boardingMinutes + path.routingAttributes.transportService.expectedWaitMinutes} 分钟 · 乘行 {path.routingAttributes.transportService.inVehicleMinutes} 分钟</span>}</div><select className={fieldClass} aria-label={`${path.title} 路网分层`} value={pathSelections[path.id]?.layer ?? ""} onChange={(event) => setPathSelections((current) => ({ ...current, [path.id]: { ...current[path.id], layer: event.target.value as GisFormalizationPathLayer } }))}><option value="">选择分层</option><option value="PUBLIC">公共接入层</option><option value="INTERNAL">景区内部层</option></select><select className={fieldClass} aria-label={`${path.title} 通行方向`} value={pathSelections[path.id]?.walkingDirection ?? ""} onChange={(event) => setPathSelections((current) => ({ ...current, [path.id]: { ...current[path.id], walkingDirection: event.target.value as GisFormalizationDirection } }))}><option value="">选择方向</option><option value="FORWARD">按绘制方向单向</option><option value="REVERSE">反绘制方向单向</option><option value="BIDIRECTIONAL">双向</option></select></div>)}</div></section>
            <section className="mt-6"><h4 className="text-sm font-semibold">入口类型 · {entrances.length}</h4><div className="mt-3 grid gap-2 md:grid-cols-2">{entrances.map((entrance) => <label key={entrance.id} className="rounded-xl border border-[#173f35]/10 bg-[#fffdf8] p-3 text-xs font-semibold">{entrance.title}<select className={`${fieldClass} mt-2`} value={entranceSelections[entrance.id] ?? ""} onChange={(event) => setEntranceSelections((current) => ({ ...current, [entrance.id]: event.target.value as GisFormalizationEntranceType }))}><option value="">选择入口类型</option><option value="ENTRY">入口</option><option value="EXIT">出口</option><option value="ENTRY_EXIT">出入口</option></select></label>)}</div></section>
            <div className="mt-6 grid gap-2 rounded-xl border border-[#b88a43]/20 bg-[#f4eadb] p-4 text-xs leading-5">{[
              "我已核对每个拟发布对象都有 HTTPS 来源且对应当前候选内容。",
              "我已核对许可允许展示、路径计算、缓存和派生处理。",
              "我理解端点只按六位坐标精确连接，系统不会静默吸附或补造拓扑。",
              "我确认 NOTE 只保留在候选审计中，不进入正式游客数据。",
            ].map((label, index) => <label key={label} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={prepareAcknowledgements[index]} onChange={(event) => setPrepareAcknowledgements((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} /><span>{label}</span></label>)}</div>
            <button type="button" onClick={() => void prepare()} disabled={phase === "submitting"} className={`${buttonClass} mt-5 bg-[#173f35] text-white`}>{phase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <FileLock size={18} />}生成不可变正式化候选</button>
          </div>}
        </main>
      </div>}

      {overview?.actorRole === "RELEASE_ADMIN" && <section className="mt-5 rounded-[1.8rem] border border-[#173f35]/10 bg-white/75 p-5">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={21} />独立管理发布</h3>
        <p className="mt-1 text-xs leading-5 text-[#64736c]">发布会原子撤下旧快照并创建新的正式 publication、路网、运营状态和游客快照；任何一步失败都会整体回滚。</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{preparedCandidates.map((candidate) => <article key={candidate.id} className="rounded-[1.4rem] border border-[#173f35]/10 bg-[#fffdf8] p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#9b7a42]">Submission #{candidate.submissionRevision}</span><h4 className="mt-1 font-semibold">{candidate.networkRevision}</h4></div><span className="rounded-full bg-[#edf0ed] px-2.5 py-1 text-[10px]">PREPARED</span></div><dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-[#64736c]">节点</dt><dd className="font-semibold">{candidate.nodeCount}</dd></div><div><dt className="text-[#64736c]">有向边</dt><dd className="font-semibold">{candidate.edgeCount}</dd></div><div><dt className="text-[#64736c]">POI</dt><dd className="font-semibold">{candidate.poiCount}</dd></div></dl><p className="mt-3 break-all font-mono text-[10px] text-[#7b8983]">SHA-256 {candidate.planSha256}</p><p className="mt-2 text-xs text-[#64736c]">运营状态有效至 {formatDate(candidate.operationalExpiresAt)}</p><button type="button" onClick={() => void publish(candidate)} disabled={phase === "submitting" || !validHttps(managementEvidence) || !publishAcknowledgements.every(Boolean)} className={`${buttonClass} mt-4 w-full bg-[#b88a43] text-white`}>{phase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <CheckCircle size={18} />}原子发布此候选</button></article>)}</div>
        {preparedCandidates.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-[#173f35]/18 p-5 text-center text-sm text-[#64736c]">当前没有未到期的正式化候选。</p>}
        <label className="mt-5 block text-xs font-semibold">管理发布证据 HTTPS<div className="relative mt-1.5"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input type="url" className={`${fieldClass} pl-9`} value={managementEvidence} onChange={(event) => { setManagementEvidence(event.target.value); publishAttempt.current = null; }} placeholder="https://…" /></div></label>
        <div className="mt-4 grid gap-2 rounded-xl border border-[#b88a43]/20 bg-[#f4eadb] p-4 text-xs leading-5">{[
          "我确认发布事务会撤下旧正式快照；旧导航必须按版本变化停止或重算。",
          "我依据本次运营证据明确确认候选全部边在发布时为 OPEN；未从事件到期或草稿状态推断开放。",
          "我确认新快照不会自动产生离线包；离线资产仍须独立审核、签名和分发。",
        ].map((label, index) => <label key={label} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={publishAcknowledgements[index]} onChange={(event) => setPublishAcknowledgements((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} /><span>{label}</span></label>)}</div>
      </section>}
    </div>
  );
}
