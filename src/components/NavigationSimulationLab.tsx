"use client";

import {
  ArrowsClockwise,
  CheckCircle,
  Footprints,
  MapPin,
  Pause,
  Play,
  Prohibit,
  SpeakerHigh,
  SpeakerSlash,
  Warning,
  Wheelchair,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import type { DirectedRoutePlan } from "@/lib/directed-route-engine";
import {
  FICTIONAL_LAB_CLOCK,
  FICTIONAL_LAB_EDGE_NAMES,
  FICTIONAL_LAB_INTERNAL_LOCATION_IDS,
  FICTIONAL_LAB_LOCATIONS,
  FICTIONAL_LAB_VISUAL_PATHS,
  calculateFictionalNavigationProgress,
  getDestinationClosureEdgeIds,
  getFictionalLocation,
  getFictionalLabTopology,
  getFictionalVisualPosition,
  planFictionalLabRoute,
  type FictionalLabProfileKind,
} from "@/lib/fictional-navigation-lab";
import styles from "./NavigationSimulationLab.module.css";

type LabStatus = "IDLE" | "READY" | "NAVIGATING" | "PAUSED" | "STOPPED" | "ARRIVED";
type LocationSignal = "GOOD" | "LOW_ACCURACY" | "DEVIATED";

const statusLabels: Record<LabStatus, string> = {
  IDLE: "等待规划",
  READY: "路线已准备",
  NAVIGATING: "虚构导航中",
  PAUSED: "指令已暂停",
  STOPPED: "导航已停止",
  ARRIVED: "演练已到达",
};

const locationOptions = FICTIONAL_LAB_INTERNAL_LOCATION_IDS.map((nodeId) => {
  const location = getFictionalLocation(nodeId);
  return { nodeId, name: location?.name ?? nodeId };
});

function createInitialPlan() {
  const envelope = planFictionalLabRoute({
    fromNodeId: "internal-gate",
    toNodeId: "observation-deck",
    profileKind: "WALK",
  });
  return envelope.result.ok ? envelope.result.plan : null;
}

function formatDistance(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} 公里` : `${Math.ceil(value)} 米`;
}

function formatMinutes(value: number) {
  if (value < 1) return "不足 1 分钟";
  return `约 ${Math.ceil(value)} 分钟`;
}

export function NavigationSimulationLab() {
  const topology = useMemo(() => getFictionalLabTopology(), []);
  const [originNodeId, setOriginNodeId] = useState("internal-gate");
  const [destinationNodeId, setDestinationNodeId] = useState("observation-deck");
  const [profileKind, setProfileKind] = useState<FictionalLabProfileKind>("WALK");
  const [closedEdgeIds, setClosedEdgeIds] = useState<string[]>([]);
  const [operationalVersion, setOperationalVersion] = useState(1);
  const [plan, setPlan] = useState<DirectedRoutePlan | null>(createInitialPlan);
  const [status, setStatus] = useState<LabStatus>("READY");
  const [traveledMeters, setTraveledMeters] = useState(0);
  const [locationSignal, setLocationSignal] = useState<LocationSignal>("GOOD");
  const [notice, setNotice] = useState("虚构路线已准备。开始前请确认：本页面不用于任何真实景区。");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastChecked, setLastChecked] = useState("等待首次运营状态检查");
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const lastSpokenRef = useRef("");

  const progress = useMemo(
    () => plan ? calculateFictionalNavigationProgress(plan, traveledMeters) : null,
    [plan, traveledMeters],
  );
  const visualPosition = progress ? getFictionalVisualPosition(progress) : null;
  const routeEdgeIds = useMemo(() => new Set(plan?.edgeIds ?? []), [plan]);
  const closedEdges = useMemo(() => new Set(closedEdgeIds), [closedEdgeIds]);

  useEffect(() => {
    const updateNetwork = () => {
      const isOnline = window.navigator.onLine;
      setOnline(isOnline);
      setLastChecked(new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()));
      if (!isOnline) {
        setStatus((current) => current === "NAVIGATING" ? "PAUSED" : current);
        setNotice("网络已断开；虽然虚构快照仍在有效期内，演练仍先暂停，确认后才可继续。");
      }
    };
    updateNetwork();
    const timer = window.setInterval(updateNetwork, 15_000);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    document.addEventListener("visibilitychange", updateNetwork);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      document.removeEventListener("visibilitychange", updateNetwork);
    };
  }, []);

  useEffect(() => {
    if (status !== "NAVIGATING" || !plan || traveledMeters >= plan.distanceMeters) return;
    const timer = window.setTimeout(() => {
      const nextDistance = Math.min(plan.distanceMeters, traveledMeters + 7);
      setTraveledMeters(nextDistance);
      if (nextDistance >= plan.distanceMeters) {
        setStatus("ARRIVED");
        setNotice("已抵达虚构终点。演练完成，没有产生或保存真实位置轨迹。");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [plan, status, traveledMeters]);

  useEffect(() => {
    if (!voiceEnabled || status !== "NAVIGATING" || !progress || !("speechSynthesis" in window)) return;
    const spokenKey = `${plan?.routeFingerprint}:${progress.activeEdgeId}`;
    if (lastSpokenRef.current === spokenKey) return;
    lastSpokenRef.current = spokenKey;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(progress.instruction);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }, [plan?.routeFingerprint, progress, status, voiceEnabled]);

  function resetForInputChange(message: string) {
    setPlan(null);
    setStatus("IDLE");
    setTraveledMeters(0);
    setLocationSignal("GOOD");
    setNotice(message);
  }

  function calculateRoute(
    nextOrigin = originNodeId,
    nextClosedEdgeIds = closedEdgeIds,
    nextOperationalVersion = operationalVersion,
    nextStatus: LabStatus = "READY",
    successNotice = "确定性虚构路线已生成，可开始演练。",
  ) {
    const envelope = planFictionalLabRoute({
      fromNodeId: nextOrigin,
      toNodeId: destinationNodeId,
      profileKind,
      closedEdgeIds: nextClosedEdgeIds,
      operationalVersion: nextOperationalVersion,
    });
    setTraveledMeters(0);
    if (!envelope.result.ok) {
      setPlan(null);
      setStatus("STOPPED");
      setNotice(`${envelope.result.message} 请停止前进并联系现场工作人员。`);
      return false;
    }
    setOriginNodeId(nextOrigin);
    setPlan(envelope.result.plan);
    setStatus(nextStatus);
    setNotice(successNotice);
    return true;
  }

  function startOrResume() {
    if (!plan) {
      calculateRoute();
      return;
    }
    if (locationSignal !== "GOOD") {
      setNotice("定位信号尚未恢复，不能继续输出虚构转向指令。");
      return;
    }
    setStatus("NAVIGATING");
    setNotice("虚构导航演练运行中；位置由页面内的虚拟指针生成，不读取设备定位。");
  }

  function pauseNavigation() {
    setStatus("PAUSED");
    setNotice("已由用户暂停，旧指令不再前进。");
  }

  function simulateLocationProblem(signal: Exclude<LocationSignal, "GOOD">) {
    if (status !== "NAVIGATING") return;
    setLocationSignal(signal);
    setStatus("PAUSED");
    setNotice(signal === "LOW_ACCURACY"
      ? "模拟定位精度降至安全阈值外：导航已暂停，不继续错误引导。"
      : "模拟偏航已触发：旧指令立即暂停，必须从已知虚构节点重新规划。"
    );
  }

  function restoreLocation() {
    setLocationSignal("GOOD");
    setStatus(plan ? "PAUSED" : "IDLE");
    setNotice("模拟定位信号已恢复。请人工确认后继续，不会自动播放旧指令。");
  }

  function replanAfterDeviation() {
    if (!plan || !progress) return;
    const reentryNodeId = progress.activeFromNodeId;
    const succeeded = calculateRoute(
      reentryNodeId,
      closedEdgeIds,
      operationalVersion,
      "PAUSED",
      `已回到${getFictionalLocation(reentryNodeId)?.shortName ?? "已知节点"}并完成确定性重算；确认后继续。`,
    );
    if (succeeded) setLocationSignal("GOOD");
  }

  function closeCurrentEdgeAndReplan() {
    if (!plan || !progress?.activeEdgeId) return;
    const closedEdgeId = progress.activeEdgeId;
    const nextClosed = [...new Set([...closedEdgeIds, closedEdgeId])];
    const nextVersion = operationalVersion + 1;
    setClosedEdgeIds(nextClosed);
    setOperationalVersion(nextVersion);
    calculateRoute(
      progress.activeFromNodeId,
      nextClosed,
      nextVersion,
      "PAUSED",
      `${FICTIONAL_LAB_EDGE_NAMES[closedEdgeId] ?? closedEdgeId}已在虚构运营版本 v${nextVersion} 中关闭；新路线已重算，确认后继续。`,
    );
  }

  function closeEveryDestinationAccess() {
    const destinationClosures = getDestinationClosureEdgeIds(destinationNodeId);
    const nextClosed = [...new Set([...closedEdgeIds, ...destinationClosures])];
    const nextVersion = operationalVersion + 1;
    const reentryNodeId = progress?.activeFromNodeId ?? originNodeId;
    setClosedEdgeIds(nextClosed);
    setOperationalVersion(nextVersion);
    calculateRoute(reentryNodeId, nextClosed, nextVersion, "STOPPED");
  }

  function restoreNetwork() {
    const nextVersion = operationalVersion + 1;
    setClosedEdgeIds([]);
    setOperationalVersion(nextVersion);
    setLocationSignal("GOOD");
    calculateRoute(originNodeId, [], nextVersion, "READY", `虚构运营版本已更新为 v${nextVersion}，所有测试道路恢复开放。`);
  }

  function toggleVoice() {
    setVoiceEnabled((current) => {
      const next = !current;
      if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setNotice(next
        ? "语音提示已为本次演练显式开启；只朗读页面上的虚构指令。"
        : "语音提示已关闭，文字指令始终保留。"
      );
      return next;
    });
  }

  return (
    <div className={styles.lab} data-navigation-lab>
      {!disclosureAccepted ? (
        <AccessibleDialog
          labelledBy="fictional-navigation-disclosure-title"
          describedBy="fictional-navigation-disclosure-description"
          onClose={() => undefined}
          className={styles.disclosureDialog}
        >
          <div className={styles.disclosureContent}>
            <span className={styles.disclosureKicker}>进入前必须确认</span>
            <Warning size={38} weight="duotone" aria-hidden="true" />
            <h2 id="fictional-navigation-disclosure-title">这是完全虚构的算法演练</h2>
            <p id="fictional-navigation-disclosure-description">页面不对应六祖镇或任何真实景区，不读取设备定位，不可用于现场行走、避险或求助。所有地点、道路和封路状态都是合成测试数据。</p>
            <ul>
              <li>不加载高德或任何真实地图底图</li>
              <li>不写入账号、行程、历史或正式路线表</li>
              <li>真实景区内部导航仍保持失败关闭</li>
            </ul>
            <button type="button" onClick={() => setDisclosureAccepted(true)}>我已理解，进入虚构演练</button>
            <Link href="/map">返回真实地图的候选数据说明</Link>
          </div>
        </AccessibleDialog>
      ) : null}
      <section className={styles.warningBanner} role="alert" data-simulation-warning>
        <Warning size={24} weight="fill" aria-hidden="true" />
        <div>
          <strong>虚构数据演练 · 不用于实地导航</strong>
          <p>名称、坐标、道路、封路和位置均为软件测试数据，与六祖镇及任何真实地点无关。</p>
        </div>
      </section>

      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>确定性路线引擎 / 安全交互沙盒</span>
          <h1>内部导航实验室</h1>
          <p>在空白示意图上验证有向步道、无障碍约束、偏航暂停、运营版本变化和无安全路线停止。</p>
        </div>
        <div className={styles.statusCard} data-navigation-status={status} aria-live="polite">
          <span className={styles.statusDot} aria-hidden="true" />
          <div><small>当前状态</small><strong>{statusLabels[status]}</strong></div>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.mapPanel} aria-labelledby="fictional-map-title">
          <div className={styles.panelHeading}>
            <div><span>FICTIONAL / SCHEMATIC</span><h2 id="fictional-map-title">虚构园区拓扑示意</h2></div>
            <div className={styles.networkBadge}>运营 v{operationalVersion}</div>
          </div>

          <div className={styles.mapCanvas}>
            <div className={styles.mapWatermark} aria-hidden="true">完全虚构演练 · 非六祖镇 · 禁止现场使用</div>
            <svg viewBox="0 0 442 260" role="img" aria-labelledby="lab-map-svg-title lab-map-svg-desc">
              <title id="lab-map-svg-title">虚构园区内部路线拓扑</title>
              <desc id="lab-map-svg-desc">仅用于测试的空白示意图，绿色为当前路线，红色为模拟关闭道路。</desc>
              <defs>
                <marker id="fictional-one-way-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              <path className={styles.transfer} d="M88 174 L132 174" />
              {topology.edges.map((edge) => {
                const visualPath = FICTIONAL_LAB_VISUAL_PATHS[edge.id];
                if (!visualPath) return null;
                const edgeState = closedEdges.has(edge.id) ? "closed" : routeEdgeIds.has(edge.id) ? "active" : "open";
                return (
                  <path
                    key={edge.id}
                    d={visualPath}
                    className={styles.routeEdge}
                    data-route-edge={edge.id}
                    data-edge-state={edgeState}
                    markerEnd={edge.walkingDirection === "FORWARD" ? "url(#fictional-one-way-arrow)" : undefined}
                  />
                );
              })}
              {FICTIONAL_LAB_LOCATIONS.map((location) => (
                <g key={location.nodeId} className={styles.mapNode} data-node-id={location.nodeId}>
                  <circle cx={location.x} cy={location.y} r="6" />
                  <text x={location.x} y={location.y + (location.y < 100 ? -13 : 22)} textAnchor="middle">{location.shortName}</text>
                </g>
              ))}
              {visualPosition ? (
                <g className={styles.currentPosition} data-current-position transform={`translate(${visualPosition.x} ${visualPosition.y})`}>
                  <circle r="12" className={styles.accuracyRing} />
                  <circle r="5" className={styles.positionDot} />
                </g>
              ) : null}
            </svg>
            <div className={styles.legend} aria-label="图例">
              <span><i data-legend="route" />当前路线</span>
              <span><i data-legend="closed" />模拟封路</span>
              <span><i data-legend="other" />其他虚构道路</span>
            </div>
          </div>

          <div className={styles.instructionCard} aria-live="polite" aria-atomic="true">
            <MapPin size={25} weight="fill" aria-hidden="true" />
            <div>
              <small>{status === "NAVIGATING" ? "下一条虚构指令" : "安全状态"}</small>
              <strong>{status === "STOPPED" ? "停止前进，联系现场工作人员" : progress?.instruction ?? notice}</strong>
              <p>{notice}</p>
            </div>
          </div>

          {plan && progress ? (
            <div className={styles.progressBlock}>
              <div className={styles.progressMeta}>
                <span>剩余 <strong>{formatDistance(progress.remainingMeters)}</strong></span>
                <span>ETA <strong>{formatMinutes(progress.remainingMinutes)}</strong></span>
              </div>
              <div className={styles.progressTrack} role="progressbar" aria-label="虚构路线进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progressRatio * 100)}>
                <span style={{ width: `${progress.progressRatio * 100}%` }} />
              </div>
            </div>
          ) : null}
        </section>

        <aside className={styles.controlPanel} aria-label="虚构导航控制台">
          <section className={styles.controlSection}>
            <div className={styles.sectionTitle}><span>01</span><div><h2>规划虚构路线</h2><p>只接受示意拓扑中的已知节点。</p></div></div>
            <label className={styles.field}>
              <span>起点</span>
              <select value={originNodeId} onChange={(event) => { setOriginNodeId(event.target.value); resetForInputChange("起点已更改，请重新生成虚构路线。"); }}>
                {locationOptions.map((option) => <option key={option.nodeId} value={option.nodeId}>{option.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>终点</span>
              <select value={destinationNodeId} onChange={(event) => { setDestinationNodeId(event.target.value); resetForInputChange("终点已更改，请重新生成虚构路线。"); }}>
                {locationOptions.map((option) => <option key={option.nodeId} value={option.nodeId}>{option.name}</option>)}
              </select>
            </label>
            <fieldset className={styles.profileChooser}>
              <legend>路线偏好</legend>
              <button type="button" aria-pressed={profileKind === "WALK"} onClick={() => { setProfileKind("WALK"); resetForInputChange("已选择标准步行，请重新生成路线。"); }}><Footprints size={18} />标准步行</button>
              <button type="button" aria-pressed={profileKind === "STEP_FREE"} onClick={() => { setProfileKind("STEP_FREE"); resetForInputChange("已选择无台阶模式，请重新生成路线。"); }}><Wheelchair size={18} />无台阶</button>
            </fieldset>
            <button type="button" className={styles.primaryButton} onClick={() => calculateRoute()}><ArrowsClockwise size={19} />生成确定性路线</button>
          </section>

          <section className={styles.controlSection}>
            <div className={styles.sectionTitle}><span>02</span><div><h2>执行与讲解</h2><p>虚拟位置仅保存在当前页面内存。</p></div></div>
            <div className={styles.buttonGrid}>
              <button type="button" onClick={startOrResume} disabled={status === "NAVIGATING" || status === "ARRIVED" || status === "STOPPED"}><Play size={18} weight="fill" />{status === "PAUSED" ? "确认继续" : "开始模拟运行"}</button>
              <button type="button" onClick={pauseNavigation} disabled={status !== "NAVIGATING"}><Pause size={18} weight="fill" />暂停</button>
              <button type="button" onClick={toggleVoice} aria-pressed={voiceEnabled}>{voiceEnabled ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}{voiceEnabled ? "关闭语音" : "开启语音"}</button>
            </div>
          </section>

          <section className={styles.controlSection}>
            <div className={styles.sectionTitle}><span>03</span><div><h2>安全故障演练</h2><p>任何异常都先停止旧指令。</p></div></div>
            <div className={styles.scenarioGrid}>
              <button type="button" onClick={() => simulateLocationProblem("LOW_ACCURACY")} disabled={status !== "NAVIGATING"}><WifiSlash size={18} />模拟低精度</button>
              <button type="button" onClick={() => simulateLocationProblem("DEVIATED")} disabled={status !== "NAVIGATING"}><Warning size={18} />模拟偏航</button>
              <button type="button" onClick={replanAfterDeviation} disabled={locationSignal !== "DEVIATED"}><ArrowsClockwise size={18} />从已知节点重算</button>
              <button type="button" onClick={restoreLocation} disabled={locationSignal === "GOOD"}><WifiHigh size={18} />恢复定位</button>
              <button type="button" onClick={closeCurrentEdgeAndReplan} disabled={!plan || status === "STOPPED"}><Prohibit size={18} />封闭当前道路</button>
              <button type="button" onClick={closeEveryDestinationAccess} disabled={!plan}><Warning size={18} />模拟无安全路线</button>
              <button type="button" onClick={restoreNetwork}><CheckCircle size={18} />恢复全部道路</button>
            </div>
          </section>

          <section className={styles.routeSummary} aria-labelledby="route-summary-title">
            <div className={styles.summaryHeading}>
              <div><small>绑定的虚构快照</small><h2 id="route-summary-title">路线与运营证据</h2></div>
              <span>{online ? <WifiHigh size={17} /> : <WifiSlash size={17} />}{online ? "在线" : "离线"}</span>
            </div>
            <dl>
              <div><dt>分类</dt><dd>{topology.classification}</dd></div>
              <div><dt>真实使用</dt><dd>{topology.realWorldUseProhibited ? "禁止" : "未标记"}</dd></div>
              <div><dt>现实对应</dt><dd>{topology.realWorldCorrespondence}</dd></div>
              <div><dt>路网 revision</dt><dd>{topology.networkRevision}</dd></div>
              <div><dt>运营版本</dt><dd>v{operationalVersion}</dd></div>
              <div><dt>模拟时钟</dt><dd>{FICTIONAL_LAB_CLOCK.toISOString()}</dd></div>
              <div><dt>最近检查</dt><dd>{lastChecked}</dd></div>
              <div><dt>位置状态</dt><dd>{locationSignal === "GOOD" ? "虚拟信号正常" : locationSignal === "LOW_ACCURACY" ? "低精度（已暂停）" : "偏航（已暂停）"}</dd></div>
            </dl>
            {closedEdgeIds.length ? <p className={styles.closedNotice}>已关闭：{closedEdgeIds.map((id) => FICTIONAL_LAB_EDGE_NAMES[id] ?? id).join("、")}</p> : null}
            {plan ? (
              <ol className={styles.routeSteps}>
                {plan.traversals.filter((traversal) => traversal.kind === "EDGE").map((traversal, index) => (
                  <li key={`${traversal.edgeId}-${traversal.traversalDirection}`}>
                    <span>{index + 1}</span>
                    <div><strong>{FICTIONAL_LAB_EDGE_NAMES[traversal.edgeId] ?? traversal.edgeId}</strong><small>{formatDistance(traversal.distanceMeters)} · {traversal.traversalDirection === "REVERSE" ? "反向通行" : "正向通行"}</small></div>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.noRoute}>当前没有可执行路线。</p>}
          </section>
        </aside>
      </div>

      <section className={styles.boundaryNote}>
        <strong>信任边界</strong>
        <p>本实验室不调用高德路线、不读取真实定位、不写入正式 GIS 表，也不能通过 <code>/api/v1/route-plans</code> 对外提供路线。真实景区只有在官方 GIS、现场复走和运营状态全部通过后才会解锁。</p>
      </section>
    </div>
  );
}
