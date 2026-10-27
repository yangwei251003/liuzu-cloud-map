import { DataControl } from "@/components/DataControl";
import { PageShell } from "@/components/PageShell";

export const metadata = { title: "数据与隐私｜六祖云游" };

export default function PrivacyPage() {
  return <PageShell title="数据与隐私"><DataControl /></PageShell>;
}
