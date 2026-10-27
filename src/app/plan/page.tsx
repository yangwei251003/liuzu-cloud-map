import { PageShell } from "@/components/PageShell";
import { TravelNotePlanner } from "@/components/TravelNotePlanner";

export const metadata = { title: "游记转行程｜六祖云游" };

export default function PlanPage() {
  return <PageShell title="游记转行程"><TravelNotePlanner /></PageShell>;
}
