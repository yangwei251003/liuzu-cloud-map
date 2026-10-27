export type ScenicSpot = {
  id: string;
  name: string;
  subtitle: string;
  category: "文化" | "山水" | "休闲";
  longitude: number;
  latitude: number;
  originalGcj02: [number, number];
  duration: string;
  verification: "候选点位";
};

// WGS84 values are approximate conversions from locally recorded GCJ-02
// research candidates. They are for prototype display, not safety navigation.
export const scenicSpots: ScenicSpot[] = [
  { id: "guoen-temple", name: "国恩寺", subtitle: "从古刹格局进入六祖文化脉络", category: "文化", longitude: 112.22292, latitude: 22.592478, originalGcj02: [112.228064, 22.589612], duration: "建议 60 分钟", verification: "候选点位" },
  { id: "huineng-residence", name: "六祖惠能故居", subtitle: "沿人物生平理解新兴的文化根脉", category: "文化", longitude: 112.21084, latitude: 22.594125, originalGcj02: [112.215999, 22.591271], duration: "建议 35 分钟", verification: "候选点位" },
  { id: "zangfo-valley", name: "藏佛坑候选区", subtitle: "山谷环境点位仍需现场消歧确认", category: "山水", longitude: 112.224602, latitude: 22.569274, originalGcj02: [112.229743, 22.566404], duration: "暂不生成导航", verification: "候选点位" },
  { id: "longshan-spring", name: "龙山温泉", subtitle: "适合放慢节奏的休闲体验节点", category: "休闲", longitude: 112.217653, latitude: 22.582133, originalGcj02: [112.222802, 22.57927], duration: "按实际行程安排", verification: "候选点位" },
  { id: "chanyu-town", name: "禅域小镇", subtitle: "文化体验与夜间活动候选入口", category: "休闲", longitude: 112.22957, latitude: 22.642818, originalGcj02: [112.234711, 22.639955], duration: "建议 45 分钟", verification: "候选点位" },
];

export const routeIdeas = [
  { id: "zen-origin", eyebrow: "初次到访", title: "寻源半日线", detail: "国恩寺 · 六祖故居 · 龙山周边", meta: "约 3 小时 · 文化优先" },
  { id: "slow-travel", eyebrow: "轻松漫游", title: "山水慢游线", detail: "古刹周边 · 湖景 · 温泉休憩", meta: "约 4 小时 · 少走路" },
  { id: "family", eyebrow: "亲子同行", title: "小荔探访线", detail: "故事讲解 · 印章收集 · 风物观察", meta: "约 2.5 小时 · 轻任务" },
];
