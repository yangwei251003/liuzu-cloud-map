import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { SavedKnowledgeCenter } from "@/components/SavedKnowledgeCenter";

export const metadata: Metadata = {
  title: "我的知识卡｜六祖云游",
  description: "在当前设备私有保存六祖文化问题与来源引用。",
};

export default function SavedKnowledgePage() {
  return <PageShell title="我的知识卡"><SavedKnowledgeCenter /></PageShell>;
}
