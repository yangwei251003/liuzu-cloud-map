import { ArrowLeft, MapTrifold } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export function SubpageHeader({ title }: { title: string }) {
  return (
    <header className="subpage-header">
      <div className="subpage-header__inner">
        <Link href="/" className="subpage-header__back"><ArrowLeft size={18} aria-hidden="true" />首页</Link>
        <span className="subpage-header__title inline-flex items-center justify-center gap-2">
          <strong className="public-text-brand">六祖云游</strong>
          <span>{title}</span>
        </span>
        <Link href="/map" aria-label="查看六祖云游详细地图" className="subpage-header__map"><MapTrifold size={20} weight="duotone" aria-hidden="true" /></Link>
      </div>
    </header>
  );
}
