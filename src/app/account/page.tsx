import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { NavigationHistoryPanel } from "@/components/NavigationHistoryPanel";
import { VisitorAccountCenter } from "@/components/VisitorAccountCenter";

export const metadata: Metadata = {
  title: "游客账号｜六祖云游",
  description: "按需登录轻量游客账号，管理可跨设备读取与撤销的只读路线分享。",
};

export default function AccountPage() {
  return <PageShell title="游客账号"><VisitorAccountCenter /><NavigationHistoryPanel /></PageShell>;
}
