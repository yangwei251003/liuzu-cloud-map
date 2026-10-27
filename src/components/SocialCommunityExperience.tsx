"use client";

import {
  ArrowRight,
  Camera,
  ChatCircle,
  CheckCircle,
  CloudCheck,
  CloudSlash,
  Compass,
  Heart,
  ImageSquare,
  MapPin,
  NavigationArrow,
  Plus,
  ShareNetwork,
  Sparkle,
  SpinnerGap,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import { AccessibleDialog } from "./AccessibleDialog";
import { getSocialCommunity, PROTOTYPE_PROFILE, SOCIAL_COMMUNITIES } from "@/lib/social/catalog";
import { relativeSocialTime } from "@/lib/social/domain";
import {
  addPrototypeComment,
  compressSocialImage,
  createPrototypeCheckIn,
  publishPrototypePost,
  readPostWithOverlays,
  readPrototypeCheckIns,
  readPrototypePosts,
  requestDevicePosition,
  subscribeSocialStore,
  togglePrototypeLike,
} from "@/lib/social/prototype-store";
import type { SocialMedia, SocialPostType, SocialVisibility } from "@/lib/social/types";
import styles from "./SocialCommunityExperience.module.css";
import { CommunityPrograms } from "./CommunityPrograms";

const POST_TYPE_LABELS: Record<SocialPostType, string> = {
  TRAVEL_NOTE: "游玩记录",
  FOOD: "美食分享",
  SCENERY: "风景照片",
  GUIDE: "攻略心得",
  CAUTION: "避坑提醒",
  LIVE_UPDATE: "实时情况",
};

const VISIBILITY_LABELS: Record<SocialVisibility, string> = {
  PUBLIC: "公开",
  FRIENDS: "好友可见",
  PRIVATE: "私密记录",
};

const serverSnapshot: ReturnType<typeof readPrototypePosts> = [];
const emptyCheckIns: ReturnType<typeof readPrototypeCheckIns> = [];

type ServiceState = "CHECKING" | "CONNECTED" | "DEVICE_ONLY" | "NETWORK_ERROR";

function SocialServiceNotice({ placeId }: { placeId: string }) {
  const [state, setState] = useState<ServiceState>("CHECKING");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        if (navigator.onLine === false) throw new Error("offline");
        const response = await fetch("/api/v1/social/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("status-unavailable");
        const value = await response.json() as unknown;
        const enabled = typeof value === "object" && value !== null && !Array.isArray(value)
          && (value as { schemaVersion?: unknown }).schemaVersion === 1
          && typeof (value as { enabled?: unknown }).enabled === "boolean"
          ? (value as { enabled: boolean }).enabled
          : null;
        if (!controller.signal.aborted) setState(enabled === true ? "CONNECTED" : enabled === false ? "DEVICE_ONLY" : "NETWORK_ERROR");
      } catch {
        if (!controller.signal.aborted) setState("NETWORK_ERROR");
      }
    })();
    return () => controller.abort();
  }, [placeId]);

  if (state === "CHECKING") return <div className={styles.serviceNotice} aria-live="polite" aria-busy="true"><SpinnerGap className={styles.spin} size={19} /><span><strong>正在核验社区服务</strong><small>确认地点、审核链与公开内容状态</small></span></div>;
  if (state === "CONNECTED") return <div className={styles.serviceNotice} data-state="connected" role="status"><CloudCheck size={20} weight="duotone" /><span><strong>审核社区服务已连接</strong><small>公开内容来自当前有效的正式地点社区；游客内容仍不代表开放或客流。</small></span></div>;
  if (state === "NETWORK_ERROR") return <div className={styles.serviceNotice} data-state="offline" role="status"><CloudSlash size={20} weight="duotone" /><span><strong>当前网络不可用</strong><small>仍可浏览示例并把个人动态、互动和打卡保存在这台设备。</small></span></div>;
  return <div className={styles.serviceNotice} data-state="device" role="status"><CloudSlash size={20} weight="duotone" /><span><strong>当前内容保存在这台设备</strong><small>登录与云端同步暂不可用，但仍可浏览、发布和记录旅行灵感。</small></span></div>;
}

function PostCard({ post: basePost }: { post: ReturnType<typeof readPrototypePosts>[number] }) {
  const post = readPostWithOverlays(basePost);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submitComment(event: FormEvent) {
    event.preventDefault();
    const result = addPrototypeComment(post.id, comment);
    if (!result.ok) { setError(result.error); return; }
    setComment("");
    setError(null);
  }

  return (
    <article className={styles.post} data-social-post-source={post.sourceKind}>
      <header className={styles.postHeader}>
        <span className={styles.avatar} aria-hidden="true">{post.authorInitial}</span>
        <div className={styles.author}>
          <strong>{post.authorName}</strong>
          <span>{relativeSocialTime(post.createdAt)} · {POST_TYPE_LABELS[post.type]} · {VISIBILITY_LABELS[post.visibility]}</span>
        </div>
        <span className={styles.sourceBadge}>{post.sourceKind === "DEMO_FIXTURE" ? "社区精选" : "本机发布"}</span>
      </header>
      <div className={styles.postBody}>
        <p>{post.body}</p>
        <div className={styles.tags}>{post.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      </div>
      {post.media[0] ? (
        <div className={styles.media}>
          <Image src={post.media[0].src} alt={post.media[0].alt} fill sizes="(max-width: 760px) 100vw, 736px" unoptimized={post.media[0].src.startsWith("data:")} />
          {post.media[0].disclosure ? <p className={styles.mediaDisclosure}>{post.media[0].disclosure}</p> : null}
        </div>
      ) : null}
      <div className={styles.postActions}>
        <button type="button" className={styles.actionButton} aria-pressed={post.likedByMe} onClick={() => togglePrototypeLike(post.id)}><Heart size={18} weight={post.likedByMe ? "fill" : "regular"} />{post.likeCount}</button>
        <button type="button" className={styles.actionButton} aria-expanded={commentsOpen} onClick={() => setCommentsOpen((value) => !value)}><ChatCircle size={18} />{post.commentCount}</button>
        <button type="button" className={styles.actionButton} onClick={() => navigator.clipboard?.writeText(`${location.origin}/community/${post.location.placeId}`)}><ShareNetwork size={18} />分享社区</button>
      </div>
      {commentsOpen ? (
        <section className={styles.comments} aria-label="评论">
          <ul>{post.comments.map((item) => <li key={item.id}><strong>{item.authorName}</strong>：{item.body}</li>)}</ul>
          <form onSubmit={submitComment}>
            <input aria-label="写评论" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} placeholder="友善交流，分享有用信息" />
            <button type="submit" aria-label="发布评论"><ArrowRight size={18} /></button>
          </form>
          {error ? <p className={styles.formNotice} role="alert">{error}</p> : null}
        </section>
      ) : null}
    </article>
  );
}

function PublishDialog({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const community = getSocialCommunity(placeId);
  const [body, setBody] = useState("");
  const [type, setType] = useState<SocialPostType>("TRAVEL_NOTE");
  const [visibility, setVisibility] = useState<SocialVisibility>("PUBLIC");
  const [tags, setTags] = useState("");
  const [media, setMedia] = useState<SocialMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseImages(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, 4);
    setError(null);
    try {
      const sources = await Promise.all(files.map(compressSocialImage));
      setMedia(sources.map((src, index) => ({ id: crypto.randomUUID(), src, alt: `用户上传的旅行照片 ${index + 1}`, kind: "IMAGE", relation: "USER_UPLOAD", disclosure: "用户上传内容；地点与拍摄时间由发布者提供。" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片处理失败。 ");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const position = await requestDevicePosition();
      const result = publishPrototypePost({ placeId, body, type, visibility, tags: tags.split(/[,，\s]+/), media, position });
      if (!result.ok) { setError(result.error); return; }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法取得位置。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessibleDialog labelledBy="social-publish-title" describedBy="social-publish-help" onClose={onClose} className={styles.dialog}>
      <div className={styles.dialogInner}>
        <header className={styles.dialogHeader}><div><h2 id="social-publish-title">发布地点动态</h2><p id="social-publish-help">动态必须读取一次设备位置并位于所选地点附近；不会开启后台持续定位。</p></div><button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭发布窗口"><X size={19} /></button></header>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}><label htmlFor="social-place">地点社区</label><input id="social-place" value={community.name} readOnly /></div>
          <div className={styles.field}><label htmlFor="social-body">旅行分享</label><textarea id="social-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={1500} placeholder="记录风景、攻略、餐饮或现场提醒。不要发布他人的敏感信息。" /></div>
          <div className={styles.fieldRow}>
            <div className={styles.field}><label htmlFor="social-type">动态类型</label><select id="social-type" value={type} onChange={(event) => setType(event.target.value as SocialPostType)}>{Object.entries(POST_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className={styles.field}><label htmlFor="social-visibility">谁可以看</label><select id="social-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as SocialVisibility)}>{Object.entries(VISIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <div className={styles.field}><label htmlFor="social-tags">标签</label><input id="social-tags" value={tags} onChange={(event) => setTags(event.target.value)} maxLength={120} placeholder="用空格或逗号分隔，最多 6 个" /></div>
          <div className={styles.field}><label className={styles.uploadButton}><ImageSquare size={21} />选择照片，最多 4 张<input className="sr-only" type="file" accept="image/*" multiple onChange={chooseImages} /></label>{media.length ? <div className={styles.previewGrid}>{media.map((item) => <Image key={item.id} src={item.src} alt={item.alt} width={240} height={240} unoptimized />)}</div> : null}</div>
          {error ? <p className={styles.formNotice} role="alert">{error}</p> : null}
          <button type="submit" className={styles.submit} disabled={busy}><NavigationArrow size={18} weight="fill" />{busy ? "正在核对位置" : "定位并发布"}</button>
        </form>
      </div>
    </AccessibleDialog>
  );
}

function CheckInDialog({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const community = getSocialCommunity(placeId);
  const [visitedAt, setVisitedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [companions, setCompanions] = useState("");
  const [visibility, setVisibility] = useState<SocialVisibility>("PRIVATE");
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setPhotoSrc(await compressSocialImage(file)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "图片处理失败。 "); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const position = await requestDevicePosition();
      const result = createPrototypeCheckIn({ placeId, visitedAt: `${visitedAt}T12:00:00`, note, companionNames: companions.split(/[,，]+/), photoSrc, visibility, position });
      if (!result.ok) { setError(result.error); return; }
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法取得位置。 "); }
    finally { setBusy(false); }
  }

  return (
    <AccessibleDialog labelledBy="social-checkin-title" describedBy="social-checkin-help" onClose={onClose} className={styles.dialog}>
      <div className={styles.dialogInner}>
        <header className={styles.dialogHeader}><div><h2 id="social-checkin-title">旅行打卡</h2><p id="social-checkin-help">精确位置默认只留在这台设备；发布时只分享你主动填写的内容。</p></div><button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭打卡窗口"><X size={19} /></button></header>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}><label htmlFor="checkin-place">打卡地点</label><input id="checkin-place" value={community.name.replace("游客社区", "")} readOnly /></div>
          <div className={styles.fieldRow}><div className={styles.field}><label htmlFor="checkin-date">旅行日期</label><input id="checkin-date" type="date" value={visitedAt} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setVisitedAt(event.target.value)} /></div><div className={styles.field}><label htmlFor="checkin-visibility">可见范围</label><select id="checkin-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as SocialVisibility)}>{Object.entries(VISIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
          <div className={styles.field}><label htmlFor="checkin-note">旅行备注</label><textarea id="checkin-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="给这次旅行留一句话" /></div>
          <div className={styles.field}><label htmlFor="checkin-companions">同行人</label><input id="checkin-companions" value={companions} onChange={(event) => setCompanions(event.target.value)} maxLength={160} placeholder="用逗号分隔；只记录已同意的人" /></div>
          <div className={styles.field}><label className={styles.uploadButton}><Camera size={21} />添加一张打卡照片<input className="sr-only" type="file" accept="image/*" onChange={choosePhoto} /></label>{photoSrc ? <div className={styles.previewGrid}><Image src={photoSrc} alt="待保存的打卡照片预览" width={240} height={240} unoptimized /></div> : null}</div>
          {error ? <p className={styles.formNotice} role="alert">{error}</p> : null}
          <button type="submit" className={styles.submit} disabled={busy}><CheckCircle size={18} weight="fill" />{busy ? "正在核对位置" : "定位并保存打卡"}</button>
        </form>
      </div>
    </AccessibleDialog>
  );
}

export function SocialCommunityExperience({ initialPlaceId = "guoen-temple" }: { initialPlaceId?: string }) {
  const [placeId, setPlaceId] = useState(getSocialCommunity(initialPlaceId).placeId);
  const [feedMode, setFeedMode] = useState<"PLACE" | "ALL" | "MINE">("PLACE");
  const [publishOpen, setPublishOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const postsSnapshot = useSyncExternalStore(subscribeSocialStore, readPrototypePosts, () => serverSnapshot);
  const checkIns = useSyncExternalStore(subscribeSocialStore, readPrototypeCheckIns, () => emptyCheckIns);
  const community = getSocialCommunity(placeId);
  const posts = useMemo(() => postsSnapshot.map(readPostWithOverlays).filter((post) => {
    if (feedMode === "MINE") return post.sourceKind === "LOCAL_PROTOTYPE";
    if (feedMode === "PLACE") return post.location.placeId === placeId;
    return true;
  }), [feedMode, placeId, postsSnapshot]);

  return (
    <main className={styles.shell}>
      <div className={styles.layout}>
        <aside className={styles.rail} aria-label="地点社区列表">
          <div className={styles.brandBlock}><span className={styles.eyebrow}>Travel social map</span><h1>旅途发生的地方，也是社区。</h1><p>在每个地点分享风景、玩法和真实体验，找到与你兴趣相投的旅行伙伴。</p></div>
          <nav className={styles.communityNav}>{SOCIAL_COMMUNITIES.map((item, index) => <button key={item.id} type="button" aria-current={placeId === item.placeId ? "true" : undefined} onClick={() => { setPlaceId(item.placeId); setFeedMode("PLACE"); }}><span className={styles.communityIndex}>{String(index + 1).padStart(2, "0")}</span><span className={styles.communityCopy}><strong>{item.name.replace("游客社区", "")}</strong><small>地点社区</small></span><span className={styles.communityCount}>{item.demoPostCount}</span></button>)}</nav>
        </aside>

        <section className={styles.main} aria-labelledby="community-title">
          <header className={styles.hero}>
            <div className={styles.heroContent}>
              <span className={styles.heroKicker}><MapPin size={15} weight="fill" />地点社区 · 资料采集于 {community.collectedAt}</span>
              <h2 id="community-title">{community.name}</h2>
              <p>{community.subtitle}。分享你的所见、攻略与旅行灵感，也请留意景区当天公告。</p>
              <div className={styles.heroActions}><button type="button" className={styles.primaryButton} onClick={() => setPublishOpen(true)}><Plus size={18} weight="bold" />发布地点动态</button><button type="button" className={styles.quietButton} onClick={() => setCheckInOpen(true)}><Camera size={18} />旅行打卡</button><Link className={styles.quietButton} href={`/map?community=${community.placeId}`}><Compass size={18} />回到地图</Link></div>
            </div>
          </header>

          <SocialServiceNotice key={placeId} placeId={placeId} />

          <CommunityPrograms placeId={placeId} />

          <div className={styles.feedTabs} role="tablist" aria-label="动态筛选"><button type="button" role="tab" aria-selected={feedMode === "PLACE"} onClick={() => setFeedMode("PLACE")}>本地动态</button><button type="button" role="tab" aria-selected={feedMode === "ALL"} onClick={() => setFeedMode("ALL")}>全部社区</button><button type="button" role="tab" aria-selected={feedMode === "MINE"} onClick={() => setFeedMode("MINE")}>我的发布</button></div>
          <div className={styles.feed} aria-live="polite">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} />) : <section className={styles.empty}><Sparkle size={28} weight="duotone" /><h2>这里还没有你的记录</h2><p>到达地点附近后，可以发布第一条带设备位置的动态。</p></section>}</div>
        </section>

        <aside className={styles.aside} aria-label="旅行档案摘要">
          <section className={styles.profileCard}><div className={styles.profileHead}><span className={styles.avatar}><UserCircle size={22} /></span><div><h2>{PROTOTYPE_PROFILE.name}</h2><small>@{PROTOTYPE_PROFILE.handle} · 设备旅行档案</small></div></div><p>{PROTOTYPE_PROFILE.bio}</p><div className={styles.profileStats}><span><strong>1</strong>城市</span><span><strong>{checkIns.length}</strong>打卡</span><span><strong>{postsSnapshot.filter((post) => post.sourceKind === "LOCAL_PROTOTYPE").length}</strong>动态</span></div><Link href={`/profile/${PROTOTYPE_PROFILE.handle}`} className={styles.profileLink}>查看旅行人生地图<ArrowRight size={15} /></Link></section>
          <section className={styles.footprint}><div className={styles.footprintTitle}>我的旅行足迹 · 精确位置不公开</div>{checkIns.slice(0, 4).map((checkIn, index) => <span key={checkIn.id} className={styles.mapDot} style={{ left: `${22 + (index % 2) * 38}%`, top: `${38 + Math.floor(index / 2) * 30}%` }} title={checkIn.placeName}><MapPin size={14} weight="fill" /></span>)}</section>
          <section className={styles.communityIntro}><h2>友善社区提示</h2><p>游客分享代表个人体验，开放时间、交通与安全信息请以景区当天公告为准。欢迎举报不实或不友善内容。</p></section>
        </aside>
      </div>
      {publishOpen ? <PublishDialog placeId={placeId} onClose={() => setPublishOpen(false)} /> : null}
      {checkInOpen ? <CheckInDialog placeId={placeId} onClose={() => setCheckInOpen(false)} /> : null}
    </main>
  );
}
