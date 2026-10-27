import { AIGuidePanel } from "@/components/AIGuidePanel";
import { PageShell, SectionHeader } from "@/components/PageShell";
import { scenicSpots } from "@/lib/scenic-data";

export const metadata = { title: "问问禅小荔｜六祖云游" };

export default async function AskGuidePage({ searchParams }: { searchParams: Promise<{ spot?: string }> }) {
  const params = await searchParams;
  const spot = scenicSpots.find((candidate) => candidate.id === params.spot);

  return (
    <PageShell title="问问禅小荔">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[.72fr_1.28fr] md:px-8 md:py-16">
        <section className="max-w-lg">
          <SectionHeader
            level={1}
            meta="Verified knowledge"
            title="有出处地认识六祖文化"
            description="禅小荔会先查阅项目登记的官方资料，再组织简短回答。遇到开放、路线、票价、安全等当前无法核验的信息，它会停下来说明边界。"
          />
          <div className="mt-8 border-t border-[#173f35]/12 pt-5 text-sm leading-7 text-[#718078]">
            文化讲解会标注来源；宗教礼仪、文物保护和当日参观要求请以现场工作人员说明为准。
          </div>
        </section>

        <AIGuidePanel
          spotId={spot?.id}
          spotName={spot?.name}
          suggestions={spot ? [`请介绍${spot.name}`, `${spot.name}有哪些有出处的文化信息？`, "哪些现场信息需要向工作人员确认？"] : undefined}
        />
      </div>
    </PageShell>
  );
}
