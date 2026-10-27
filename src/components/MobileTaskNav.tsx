"use client";

import { Backpack, Compass, House, MapPin, Path, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { label: "首页", href: "/", icon: House, match: (pathname: string, hash: string) => (pathname === "/" && hash !== "#map") || pathname.startsWith("/cloud-tour") },
  { label: "行程", href: "/plan", icon: Path, match: (pathname: string) => pathname.startsWith("/plan") || pathname.startsWith("/guide") || pathname.startsWith("/arrival") },
  { label: "地图", href: "/map", icon: MapPin, match: (pathname: string, hash: string) => pathname.startsWith("/map") || pathname.startsWith("/navigation-lab") || (pathname === "/" && hash === "#map") },
  { label: "社区", href: "/community", icon: UsersThree, match: (pathname: string) => pathname.startsWith("/community") },
  { label: "我的", href: "/account", icon: Backpack, match: (pathname: string) => pathname.startsWith("/journey") || pathname.startsWith("/privacy") || pathname.startsWith("/account") || pathname.startsWith("/share") || pathname.startsWith("/profile") },
] as const;

const routeLabels: Array<{ match: (pathname: string) => boolean; label: string }> = [
  { match: (pathname) => pathname.startsWith("/explore"), label: "文旅发现" },
  { match: (pathname) => pathname.startsWith("/place"), label: "地点胜境" },
  { match: (pathname) => pathname.startsWith("/activity"), label: "体验活动" },
  { match: (pathname) => pathname.startsWith("/trip"), label: "我的收藏" },
  { match: (pathname) => pathname.startsWith("/arrival"), label: "到达助手" },
  { match: (pathname) => pathname.startsWith("/cloud-tour"), label: "线上云游" },
  { match: (pathname) => pathname.startsWith("/guide/ask"), label: "文化问答" },
  { match: (pathname) => pathname.startsWith("/guide"), label: "现场导览" },
  { match: (pathname) => pathname.startsWith("/journey/knowledge"), label: "知识卡" },
  { match: (pathname) => pathname.startsWith("/journey"), label: "我的旅程" },
  { match: (pathname) => pathname.startsWith("/community"), label: "地点社区" },
  { match: (pathname) => pathname.startsWith("/profile"), label: "旅行档案" },
  { match: (pathname) => pathname.startsWith("/account"), label: "游客账号" },
  { match: (pathname) => pathname.startsWith("/navigation-lab"), label: "虚构导航实验室" },
  { match: (pathname) => pathname.startsWith("/map"), label: "详细地图" },
  { match: (pathname) => pathname.startsWith("/plan"), label: "行程规划" },
  { match: (pathname) => pathname.startsWith("/privacy"), label: "数据与隐私" },
  { match: (pathname) => pathname.startsWith("/share"), label: "路线分享" },
  { match: (pathname) => pathname.startsWith("/admin/readiness"), label: "发布证据预检" },
  { match: (pathname) => pathname.startsWith("/admin"), label: "运营治理" },
];

export function MobileTaskNav() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [pathname]);

  const isAdmin = pathname.startsWith("/admin");
  const routeLabel = routeLabels.find((item) => item.match(pathname))?.label ?? "文化数字导览";

  return (
    <>
      {pathname !== "/" ? (
        <header className="desktop-site-header hidden lg:block">
          <div className="desktop-site-header__inner">
            <Link href="/" className="desktop-site-header__brand" aria-label="返回六祖云游首页">
              <span className="desktop-site-header__mark" aria-hidden="true">
                <span aria-hidden="true">云游</span>
              </span>
              <span><strong>六祖云游</strong><small>文化体验项目</small></span>
            </Link>
            <nav className="desktop-task-nav" aria-label="桌面端主导航">
              {items.map((item) => {
                const current = item.match(pathname, hash);
                return (
                  <Link key={item.label} href={item.href} aria-current={current ? "page" : undefined} className="desktop-task-nav__link">
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <span className="desktop-site-header__context"><Compass size={17} weight="duotone" aria-hidden="true" />{routeLabel}</span>
          </div>
        </header>
      ) : null}

      {!isAdmin ? (
        <nav className="visitor-task-nav" aria-label="移动端主导航">
          {items.map((item) => {
            const Icon = item.icon;
            const current = item.match(pathname, hash);
            return (
              <Link key={item.label} href={item.href} aria-current={current ? "page" : undefined} className="visitor-task-nav__link">
                <Icon size={20} weight={current ? "fill" : "duotone"} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
