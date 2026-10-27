import { notFound } from "next/navigation";
import styles from "./typography-preview.module.css";

export const metadata = { title: "Typography Preview · 六祖云游" };

const samples = ["六祖故里", "千年禅脉", "云游新兴", "一念岭南", "国恩寺", "菩提本无树。"];

export default function TypographyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>LOCAL DEVELOPMENT ONLY · TYPOGRAPHY SYSTEM</p>
        <h1>文字也可以成为一条文化路线</h1>
        <p className={styles.lede}>用于比较字体角色、字号、字重、字距和中英文混排。此页面不会在生产环境开放。</p>
      </header>

      <section className={styles.grid} aria-label="字体角色预览">
        <article className={`${styles.card} ${styles.heroDisplay}`}>
          <span className={styles.role}>01 · Hero Display · 方正宋刻本秀楷简体</span>
          <h2>今天，</h2>
          <p>只承担短句、品牌情绪和视觉记忆，不用于功能操作。</p>
        </article>
        <article className={`${styles.card} ${styles.culturalDisplay}`}>
          <span className={styles.role}>02 · Cultural Display · 方正清刻本悦宋简体</span>
          <h2>寻迹六祖故里</h2>
          <p>用于页面标题、文化栏目、景点名称和章节开场。</p>
        </article>
        <article className={`${styles.card} ${styles.xingkai}`}>
          <span className={styles.role}>03 · Narrative · 方正行楷简体</span>
          <h2>想怎样遇见新兴？</h2>
          <p>用于 Hero 问句、路线标题和短叙事；不用于长正文或安全提示。</p>
        </article>
        <article className={`${styles.card} ${styles.humanistic}`}>
          <span className={styles.role}>04 · Humanistic · LXGW WenKai</span>
          <h2>山水有来处，故事在路上</h2>
          <p>用于文化说明、游记片段、景点小故事和社区标题。</p>
        </article>
        <article className={`${styles.card} ${styles.zenMark}`}>
          <span className={styles.role}>05 · Zen Mark · 汉仪曾翔禅趣体</span>
          <h2>禅 · 悟 · 心</h2>
          <p>只作为一至六字的章节符号或背景字，保持低频和低对比。</p>
        </article>
        <article className={`${styles.card} ${styles.uiRole}`}>
          <span className={styles.role}>06 · UI · Noto Sans SC</span>
          <h2>打开地图 · 查看路线</h2>
          <p>用于导航、按钮、表单、地图、数据、权限和安全提示。</p>
          <button type="button">示例按钮</button>
        </article>
      </section>

      <section className={styles.samples} aria-labelledby="samples-title">
        <div>
          <span className={styles.role}>COMMON SAMPLES</span>
          <h2 id="samples-title">常用中文案例</h2>
        </div>
        <div className={styles.sampleGrid}>
          {samples.map((sample) => <span key={sample}>{sample}</span>)}
        </div>
      </section>
    </main>
  );
}
