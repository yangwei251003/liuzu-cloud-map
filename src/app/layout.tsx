import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AccessibilityShell } from "@/components/AccessibilityShell";
import { AppFrame } from "@/components/AppFrame";
import { ConnectivityStatus } from "@/components/ConnectivityStatus";
import FounderCloudFonts from "@/components/FounderCloudFonts";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/noto-serif-sc/wght.css";
import "@fontsource/lxgw-wenkai/500.css";
import "@fontsource/ma-shan-zheng/chinese-simplified-400.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "六祖云游｜新兴文化数字导览",
  description: "以真实地图连接六祖文化、在地风物与个性化游览体验。",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/images/neutral-app-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "六祖云游",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f3f6f1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <FounderCloudFonts />
        <AccessibilityShell>
          <p className="public-build-notice" role="note">开源开发演示：资料/坐标待核验，地图非正式导航；账号、商户和交易均不可视为真实业务。请勿输入私人信息。</p>
          <AppFrame>
            <ConnectivityStatus />
            {children}
          </AppFrame>
        </AccessibilityShell>
      </body>
    </html>
  );
}
