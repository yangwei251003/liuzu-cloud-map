"use client";

import { ArrowLeft, Camera, MapPin, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PROTOTYPE_PROFILE } from "@/lib/social/catalog";
import { readPrototypeCheckIns, readPrototypePosts, subscribeSocialStore } from "@/lib/social/prototype-store";
import styles from "./TravelProfileExperience.module.css";

const emptyCheckIns: ReturnType<typeof readPrototypeCheckIns> = [];
const emptyPosts: ReturnType<typeof readPrototypePosts> = [];

export function TravelProfileExperience({ handle }: { handle: string }) {
  const checkIns = useSyncExternalStore(subscribeSocialStore, readPrototypeCheckIns, () => emptyCheckIns);
  const posts = useSyncExternalStore(subscribeSocialStore, readPrototypePosts, () => emptyPosts).filter((post) => post.sourceKind === "LOCAL_PROTOTYPE");
  const name = handle === PROTOTYPE_PROFILE.handle ? PROTOTYPE_PROFILE.name : handle;

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <div>
            <div className={styles.identity}><span className={styles.avatar}><UserCircle size={35} weight="duotone" /></span><div><h1>{name}</h1><p>@{handle} · 本机旅行档案</p></div></div>
            <p className={styles.bio}>{PROTOTYPE_PROFILE.bio} 当前页只读取这台设备上的个人记录，不会自动上传精确位置。</p>
            <div className={styles.actions}><Link href="/community"><ArrowLeft size={16} />返回地点社区</Link></div>
          </div>
          <div className={styles.stats}><div><strong>{PROTOTYPE_PROFILE.cityCount}</strong><span>去过城市</span></div><div><strong>{checkIns.length}</strong><span>景点打卡</span></div><div><strong>{posts.reduce((sum, post) => sum + post.media.length, 0)}</strong><span>上传照片</span></div><div><strong>{posts.filter((post) => post.type === "GUIDE").length}</strong><span>发布攻略</span></div></div>
        </section>

        <div className={styles.grid}>
          <section className={styles.map} aria-labelledby="travel-map-title"><header className={styles.sectionHead}><span>Private footprint</span><h2 id="travel-map-title">个人旅行地图 · 精确位置不公开</h2></header>{checkIns.length ? checkIns.slice(0, 6).map((checkIn, index) => <span key={checkIn.id} className={styles.dot} style={{ left: `${18 + (index % 3) * 28}%`, top: `${32 + Math.floor(index / 3) * 34}%` }} title={`${checkIn.placeName} · ${checkIn.visitedAt.slice(0, 10)}`}><MapPin size={17} weight="fill" /></span>) : <div className={styles.mapEmpty}><div><MapPin size={30} weight="duotone" /><p>完成第一次带设备位置的旅行打卡后，足迹会出现在这里。</p></div></div>}</section>
          <section className={styles.timeline} aria-labelledby="travel-timeline-title"><header className={styles.sectionHead}><span>Travel archive</span><h2 id="travel-timeline-title">最近旅行记录</h2></header><ul className={styles.timelineList}>{checkIns.map((checkIn) => <li key={checkIn.id}><span className={styles.timelineIcon}>{checkIn.photoSrc ? <Camera size={18} /> : <MapPin size={18} />}</span><div><strong>{checkIn.placeName}</strong><small>{checkIn.visitedAt.slice(0, 10)} · {checkIn.visibility === "PRIVATE" ? "私密记录" : checkIn.visibility === "FRIENDS" ? "好友可见" : "公开"}<br />{checkIn.note || "没有添加备注"}</small></div></li>)}</ul>{checkIns.length === 0 ? <p className={styles.notice}>当前没有本机打卡。地点与旅行记录将在用户主动授权后创建，不会根据浏览历史自动推断。</p> : null}</section>
        </div>
        <p className={styles.notice}>隐私提示：个人足迹不对外公开精确坐标。跨设备使用时，平台仍会遵循最小位置精度、可见范围控制以及删除与导出规则。</p>
      </div>
    </main>
  );
}
