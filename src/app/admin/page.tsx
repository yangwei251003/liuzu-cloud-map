import type { Metadata } from "next";
import { AdminGovernance } from "@/components/AdminGovernance";
import { AdminCommunityEventPublisher } from "@/components/CommunityPrograms";

export const metadata: Metadata = {
  title: "运营治理台｜六祖云游",
  description: "六祖云游本机运营治理流程原型。",
};

export default function AdminPage() {
  return <><AdminGovernance /><AdminCommunityEventPublisher /></>;
}
