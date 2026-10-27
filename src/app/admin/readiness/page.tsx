import { PageShell } from "@/components/PageShell";
import { ReleaseReadinessWorkbench } from "@/components/ReleaseReadinessWorkbench";

export const metadata = {
  title: "正式发布证据预检 · 六祖云游",
  description: "严格检查景区边界、入口、路网、现场复走、内容权利与发布职责分离证据。",
};

export default function ReleaseReadinessPage() {
  return <PageShell title="发布证据预检"><ReleaseReadinessWorkbench /></PageShell>;
}
