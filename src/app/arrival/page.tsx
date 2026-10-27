import type { Metadata } from "next";
import { ArrivalAssistant } from "@/components/ArrivalAssistant";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "到达助手｜六祖云游",
  description: "区分已核实节点与当天动态状态，帮助自驾、高铁和周边游客先确认范围与入口，再开始游览。",
};

export default function ArrivalPage() {
  return <PageShell title="到达助手"><ArrivalAssistant /></PageShell>;
}
